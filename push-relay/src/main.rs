//! A stateless Web Push relay for sowocial.
//!
//! A fediverse server sends an RFC 8291 (`aes128gcm`) encrypted Web Push to
//! `POST /push/{platform}/{expo push token}`. The relay passes the ciphertext on through
//! Expo's push service without reading it: the app holds the keys and decrypts on the device.
//! Nothing is stored; the push token in the URL is the whole state.

use std::env;
use std::net::SocketAddr;

use axum::Router;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};

const EXPO_PUSH_URL: &str = "https://exp.host/--/api/v2/push/send";

/// Expo refuses payloads over 4096 bytes; base64 grows the body by a third.
const MAX_BODY_BYTES: usize = 2560;

#[derive(Clone)]
struct Relay {
    client: reqwest::Client,
    expo_url: String,
    access_token: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    Ios,
    Android,
}

impl Platform {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "ios" => Some(Self::Ios),
            "android" => Some(Self::Android),
            _ => None,
        }
    }
}

fn valid_token(token: &str) -> bool {
    let inner = token
        .strip_prefix("ExponentPushToken[")
        .or_else(|| token.strip_prefix("ExpoPushToken["))
        .and_then(|rest| rest.strip_suffix(']'));
    inner.is_some_and(|inner| {
        !inner.is_empty()
            && inner.len() <= 128
            && inner.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    })
}

/// iOS shows an alert only if one is sent, and runs the app's notification service
/// extension on it when `mutableContent` is set; the extension replaces the placeholder
/// text with the decrypted one. Android gets a data-only message that the app's
/// background task decrypts and shows.
fn expo_message(platform: Platform, token: &str, body: &[u8]) -> Value {
    let data = json!({ "m": STANDARD.encode(body) });
    match platform {
        Platform::Ios => json!({
            "to": token,
            "data": data,
            "title": "sowocial",
            "body": "New notification",
            "mutableContent": true,
            "sound": "default",
            "priority": "high",
        }),
        Platform::Android => json!({
            "to": token,
            "data": data,
            "priority": "high",
        }),
    }
}

/// Web Push servers drop a subscription on 404 or 410, which is what an
/// uninstalled app should cause.
fn status_for(ticket: &Value) -> StatusCode {
    let ticket = ticket.get("data").map_or(ticket, |data| {
        data.as_array().and_then(|tickets| tickets.first()).unwrap_or(data)
    });
    match ticket.get("status").and_then(Value::as_str) {
        Some("ok") => StatusCode::CREATED,
        _ if ticket.pointer("/details/error").and_then(Value::as_str) == Some("DeviceNotRegistered") => {
            StatusCode::GONE
        }
        _ => StatusCode::BAD_GATEWAY,
    }
}

async fn push(
    State(relay): State<Relay>,
    Path((platform, token)): Path<(String, String)>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(platform) = Platform::parse(&platform) else {
        return StatusCode::NOT_FOUND;
    };
    if !valid_token(&token) {
        return StatusCode::NOT_FOUND;
    }
    // The app only decrypts RFC 8291; the older `aesgcm` drafts would arrive unreadable.
    if headers.get("content-encoding").and_then(|v| v.to_str().ok()) != Some("aes128gcm") {
        return StatusCode::UNSUPPORTED_MEDIA_TYPE;
    }
    if body.is_empty() {
        return StatusCode::BAD_REQUEST;
    }

    let mut request = relay.client.post(&relay.expo_url).json(&expo_message(platform, &token, &body));
    if let Some(access_token) = &relay.access_token {
        request = request.bearer_auth(access_token);
    }
    match request.send().await {
        Ok(response) if response.status().is_success() => match response.json::<Value>().await {
            Ok(ticket) => status_for(&ticket),
            Err(_) => StatusCode::BAD_GATEWAY,
        },
        Ok(response) if response.status() == StatusCode::TOO_MANY_REQUESTS => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::BAD_GATEWAY,
    }
}

fn app(relay: Relay) -> Router {
    Router::new()
        .route("/push/{platform}/{token}", post(push))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .route("/health", get(|| async { "ok" }))
        .with_state(relay)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let relay = Relay {
        client: reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build()?,
        expo_url: env::var("EXPO_PUSH_URL").unwrap_or_else(|_| EXPO_PUSH_URL.to_owned()),
        access_token: env::var("EXPO_ACCESS_TOKEN").ok().filter(|t| !t.is_empty()),
    };
    let addr: SocketAddr = env::var("BIND").unwrap_or_else(|_| "0.0.0.0:8080".to_owned()).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("sowocial push relay listening on {addr}");
    axum::serve(listener, app(relay))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    use super::*;

    fn relay(expo_url: &str) -> Relay {
        Relay { client: reqwest::Client::new(), expo_url: expo_url.to_owned(), access_token: None }
    }

    #[test]
    fn accepts_only_expo_tokens() {
        assert!(valid_token("ExponentPushToken[abc-DEF_123]"));
        assert!(valid_token("ExpoPushToken[abc]"));
        assert!(!valid_token("ExponentPushToken[]"));
        assert!(!valid_token("ExponentPushToken[a/b]"));
        assert!(!valid_token("https://evil.example"));
    }

    #[test]
    fn ios_gets_a_mutable_alert_and_android_data_only() {
        let ios = expo_message(Platform::Ios, "ExpoPushToken[a]", b"\x01\x02");
        assert_eq!(ios["mutableContent"], true);
        assert_eq!(ios["data"]["m"], "AQI=");
        let android = expo_message(Platform::Android, "ExpoPushToken[a]", b"\x01\x02");
        assert!(android.get("title").is_none());
        assert_eq!(android["priority"], "high");
    }

    #[test]
    fn maps_expo_tickets_to_web_push_statuses() {
        assert_eq!(status_for(&json!({ "data": { "status": "ok", "id": "x" } })), StatusCode::CREATED);
        assert_eq!(status_for(&json!({ "data": [{ "status": "ok", "id": "x" }] })), StatusCode::CREATED);
        let gone = json!({ "data": { "status": "error", "details": { "error": "DeviceNotRegistered" } } });
        assert_eq!(status_for(&gone), StatusCode::GONE);
        assert_eq!(status_for(&json!({ "data": { "status": "error" } })), StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn refuses_bad_requests_before_calling_expo() {
        // An unroutable upstream: any request reaching it would fail as 502, not these codes.
        let app = app(relay("http://127.0.0.1:9"));
        let request = |uri: &str, encoding: &str, body: Vec<u8>| {
            Request::post(uri).header("content-encoding", encoding).body(Body::from(body)).unwrap_or_default()
        };
        let cases = [
            (request("/push/web/ExpoPushToken[a]", "aes128gcm", vec![1]), StatusCode::NOT_FOUND),
            (request("/push/ios/nope", "aes128gcm", vec![1]), StatusCode::NOT_FOUND),
            (request("/push/ios/ExpoPushToken[a]", "aesgcm", vec![1]), StatusCode::UNSUPPORTED_MEDIA_TYPE),
            (request("/push/ios/ExpoPushToken[a]", "aes128gcm", vec![]), StatusCode::BAD_REQUEST),
            (
                request("/push/ios/ExpoPushToken[a]", "aes128gcm", vec![0; MAX_BODY_BYTES + 1]),
                StatusCode::PAYLOAD_TOO_LARGE,
            ),
        ];
        for (request, expected) in cases {
            let response = app.clone().oneshot(request).await.map(|r| r.status());
            assert_eq!(response.ok(), Some(expected));
        }
    }
}
