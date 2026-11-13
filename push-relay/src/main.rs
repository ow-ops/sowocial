//! Stateless relay from RFC 8291 Web Push to APNs and FCM. The ciphertext is forwarded
//! unread; the app decrypts it on the device.

mod bsky;

use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use a2::request::payload::Payload;
use a2::{
    DefaultNotificationBuilder, ErrorReason, NotificationBuilder, NotificationOptions, Priority,
    PushType,
};
use axum::Router;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use gcp_auth::{CustomServiceAccount, TokenProvider};
use serde_json::{Value, json};
use tokio::signal::unix::{SignalKind, signal};
use tracing::{debug, error, info, warn};
use tracing_subscriber::EnvFilter;

const FCM_SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";

/// APNs and FCM both refuse payloads over 4096 bytes; base64 grows the body by a third.
const MAX_BODY_BYTES: usize = 2560;

/// FCM stores messages for at most four weeks.
const MAX_TTL_SECS: u64 = 4 * 7 * 24 * 60 * 60;

struct Relay {
    client: reqwest::Client,
    apns: Option<Apns>,
    fcm: Option<Fcm>,
    bsky: Arc<bsky::Registry>,
}

struct Apns {
    production: a2::Client,
    sandbox: a2::Client,
    topic: String,
}

struct Fcm {
    account: CustomServiceAccount,
    url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    Ios,
    IosSandbox,
    Android,
}

impl Platform {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "ios" => Some(Self::Ios),
            "ios-sandbox" => Some(Self::IosSandbox),
            "android" => Some(Self::Android),
            _ => None,
        }
    }

    fn valid_token(self, token: &str) -> bool {
        match self {
            Self::Ios | Self::IosSandbox => {
                (1..=200).contains(&token.len()) && token.bytes().all(|b| b.is_ascii_hexdigit())
            }
            Self::Android => {
                (1..=512).contains(&token.len())
                    && token
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b':'))
            }
        }
    }
}

/// RFC 8030 `TTL` and `Urgency` request headers.
#[derive(Debug, PartialEq, Eq)]
struct Delivery {
    ttl: Option<u64>,
    urgent: bool,
}

impl Delivery {
    fn from_headers(headers: &HeaderMap) -> Option<Self> {
        let ttl = match headers.get("ttl") {
            Some(value) => Some(value.to_str().ok()?.parse::<u64>().ok()?.min(MAX_TTL_SECS)),
            None => None,
        };
        let urgent = match headers.get("urgency").map(|value| value.to_str()) {
            None | Some(Ok("normal" | "high")) => true,
            Some(Ok("low" | "very-low")) => false,
            Some(_) => return None,
        };
        Some(Self { ttl, urgent })
    }
}

/// iOS shows an alert only if one is sent, and runs the app's notification service
/// extension on it when `mutable-content` is set; the extension replaces the placeholder
/// text with the decrypted one.
fn apns_payload<'a>(
    token: &'a str,
    topic: &'a str,
    message: &'a str,
    delivery: &Delivery,
    now: u64,
) -> Payload<'a> {
    let options = NotificationOptions {
        apns_topic: Some(topic),
        apns_push_type: Some(PushType::Alert),
        apns_priority: Some(if delivery.urgent {
            Priority::High
        } else {
            Priority::Normal
        }),
        apns_expiration: delivery.ttl.map(|ttl| now + ttl),
        ..Default::default()
    };
    let mut payload = DefaultNotificationBuilder::new()
        .set_title("sowocial")
        .set_body("New notification")
        .set_sound("default")
        .set_mutable_content()
        .build(token, options);
    payload.data.insert("m", Value::String(message.to_owned()));
    payload
}

/// Android gets a data-only message that the app's background task decrypts and shows.
fn fcm_message(token: &str, message: &str, delivery: &Delivery) -> Value {
    let mut android = json!({ "priority": if delivery.urgent { "high" } else { "normal" } });
    if let Some(ttl) = delivery.ttl {
        android["ttl"] = format!("{ttl}s").into();
    }
    json!({
        "message": {
            "token": token,
            "data": { "m": message },
            "android": android,
        }
    })
}

/// Mastodon and `GoToSocial` drop the subscription on 410, which is what an uninstalled app
/// should cause. 5xx and 429 make them retry.
fn status_for_apns(error: &a2::Error) -> StatusCode {
    let a2::Error::ResponseError(response) = error else {
        return StatusCode::BAD_GATEWAY;
    };
    match response.error.as_ref().map(|body| &body.reason) {
        Some(ErrorReason::Unregistered | ErrorReason::BadDeviceToken) => StatusCode::GONE,
        Some(ErrorReason::TooManyRequests) => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::BAD_GATEWAY,
    }
}

/// FCM reports a dead registration as `UNREGISTERED`, and a malformed one as
/// `INVALID_ARGUMENT` with a violation on the token field. A bare 404 is not enough: it
/// also comes back when the project in the URL is wrong, which would drop every subscription.
fn status_for_fcm(status: StatusCode, body: &Value) -> StatusCode {
    let error = &body["error"];
    let details = error["details"].as_array().map_or(&[][..], Vec::as_slice);
    let unregistered = details
        .iter()
        .any(|detail| detail["errorCode"] == "UNREGISTERED");
    let bad_token = error["status"] == "INVALID_ARGUMENT"
        && details
            .iter()
            .filter_map(|detail| detail["fieldViolations"].as_array())
            .flatten()
            .any(|violation| {
                violation["field"]
                    .as_str()
                    .is_some_and(|field| field.ends_with("token"))
            });
    if unregistered || bad_token {
        StatusCode::GONE
    } else if status == StatusCode::TOO_MANY_REQUESTS {
        StatusCode::TOO_MANY_REQUESTS
    } else {
        StatusCode::BAD_GATEWAY
    }
}

impl Apns {
    async fn send(
        &self,
        sandbox: bool,
        token: &str,
        message: &str,
        delivery: &Delivery,
    ) -> StatusCode {
        let client = if sandbox {
            &self.sandbox
        } else {
            &self.production
        };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs());
        let payload = apns_payload(token, &self.topic, message, delivery, now);
        match client.send(payload).await {
            Ok(_) => StatusCode::CREATED,
            Err(error) => {
                let status = status_for_apns(&error);
                if let a2::Error::ResponseError(response) = &error {
                    let reason = response.error.as_ref().map(|body| &body.reason);
                    if status == StatusCode::GONE {
                        debug!(code = response.code, ?reason, "APNs rejected the token");
                    } else {
                        warn!(code = response.code, ?reason, "APNs returned an error");
                    }
                } else {
                    warn!(%error, "APNs request failed");
                }
                status
            }
        }
    }
}

impl Fcm {
    async fn send(
        &self,
        client: &reqwest::Client,
        token: &str,
        message: &str,
        delivery: &Delivery,
    ) -> StatusCode {
        let access_token = match self.account.token(&[FCM_SCOPE]).await {
            Ok(access_token) => access_token,
            Err(error) => {
                error!(%error, "FCM access token fetch failed");
                return StatusCode::BAD_GATEWAY;
            }
        };
        let request = client
            .post(&self.url)
            .bearer_auth(access_token.as_str())
            .json(&fcm_message(token, message, delivery));
        match request.send().await {
            Ok(response) if response.status().is_success() => StatusCode::CREATED,
            Ok(response) => {
                let status = response.status();
                let body: Value = response.json().await.unwrap_or_default();
                let mapped = status_for_fcm(status, &body);
                let error = &body["error"];
                let error_status = error["status"].as_str();
                if mapped == StatusCode::GONE {
                    debug!(
                        http = status.as_u16(),
                        error_status, "FCM rejected the token"
                    );
                } else {
                    let message = error["message"].as_str();
                    warn!(
                        http = status.as_u16(),
                        error_status, message, "FCM returned an error"
                    );
                }
                mapped
            }
            Err(error) => {
                warn!(%error, "FCM request failed");
                StatusCode::BAD_GATEWAY
            }
        }
    }
}

impl Relay {
    /// Hands the ciphertext to APNs or FCM for one device. A platform whose credentials are not
    /// set answers 503.
    async fn forward(
        &self,
        platform: Platform,
        token: &str,
        ciphertext: &[u8],
        delivery: &Delivery,
    ) -> StatusCode {
        let message = STANDARD.encode(ciphertext);
        match platform {
            Platform::Ios | Platform::IosSandbox => match &self.apns {
                Some(apns) => {
                    apns.send(platform == Platform::IosSandbox, token, &message, delivery)
                        .await
                }
                None => StatusCode::SERVICE_UNAVAILABLE,
            },
            Platform::Android => match &self.fcm {
                Some(fcm) => fcm.send(&self.client, token, &message, delivery).await,
                None => StatusCode::SERVICE_UNAVAILABLE,
            },
        }
    }
}

async fn push(
    State(relay): State<Arc<Relay>>,
    Path((platform, token)): Path<(String, String)>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(platform) = Platform::parse(&platform) else {
        return StatusCode::NOT_FOUND;
    };
    if !platform.valid_token(&token) {
        return StatusCode::NOT_FOUND;
    }
    // The app only decrypts RFC 8291; the older `aesgcm` draft would arrive unreadable.
    if headers
        .get("content-encoding")
        .and_then(|v| v.to_str().ok())
        != Some("aes128gcm")
    {
        return StatusCode::UNSUPPORTED_MEDIA_TYPE;
    }
    if body.is_empty() {
        return StatusCode::BAD_REQUEST;
    }
    let Some(delivery) = Delivery::from_headers(&headers) else {
        return StatusCode::BAD_REQUEST;
    };

    relay.forward(platform, &token, &body, &delivery).await
}

fn app(relay: Arc<Relay>) -> Router {
    Router::new()
        .route("/push/{platform}/{token}", post(push))
        .route("/bsky/subscriptions", bsky::routes())
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .route("/health", get(|| async { "ok" }))
        .with_state(relay)
}

fn env_var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.is_empty())
}

fn load_apns() -> Result<Option<Apns>, Box<dyn std::error::Error>> {
    let Some(key_file) = env_var("APNS_KEY_FILE") else {
        return Ok(None);
    };
    let key_id = env_var("APNS_KEY_ID").ok_or("APNS_KEY_ID is required with APNS_KEY_FILE")?;
    let team_id = env_var("APNS_TEAM_ID").ok_or("APNS_TEAM_ID is required with APNS_KEY_FILE")?;
    let key = std::fs::read(key_file)?;
    let client = |endpoint| {
        a2::Client::token(
            key.as_slice(),
            key_id.as_str(),
            team_id.as_str(),
            a2::ClientConfig::new(endpoint),
        )
    };
    Ok(Some(Apns {
        production: client(a2::Endpoint::Production)?,
        sandbox: client(a2::Endpoint::Sandbox)?,
        topic: env_var("APNS_TOPIC").unwrap_or_else(|| "eu.owops.sowocial".to_owned()),
    }))
}

fn load_fcm() -> Result<Option<Fcm>, Box<dyn std::error::Error>> {
    let Some(credentials_file) = env_var("FCM_CREDENTIALS_FILE") else {
        return Ok(None);
    };
    let account = CustomServiceAccount::from_file(credentials_file)?;
    let project_id = account
        .project_id()
        .ok_or("the FCM service account has no project_id")?;
    let url = format!("https://fcm.googleapis.com/v1/projects/{project_id}/messages:send");
    Ok(Some(Fcm { account, url }))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::builder()
                .with_default_directive(tracing::Level::INFO.into())
                .from_env_lossy(),
        )
        .init();
    // a2 enables rustls's ring provider and reqwest its aws-lc-rs one, so rustls cannot pick a
    // default by itself and the Jetstream connection would panic.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let relay = bsky::start(|bsky| {
        Ok(Relay {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()?,
            apns: load_apns()?,
            fcm: load_fcm()?,
            bsky,
        })
    })?;
    info!(
        apns = relay.apns.is_some(),
        fcm = relay.fcm.is_some(),
        "providers configured"
    );
    let addr: SocketAddr = env::var("BIND")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_owned())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(%addr, "sowocial push relay listening");
    let mut sigterm = signal(SignalKind::terminate())?;
    axum::serve(listener, app(relay.clone()))
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = sigterm.recv() => {}
            }
        })
        .await?;
    if let Err(error) = relay.bsky.flush() {
        error!(%error, "could not write the Bluesky registrations on shutdown");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use a2::request::payload::PayloadLike;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    use super::*;

    fn relay() -> Relay {
        Relay {
            client: reqwest::Client::new(),
            apns: None,
            fcm: None,
            bsky: Arc::new(bsky::Registry::load(None, 100, None).unwrap()),
        }
    }

    fn apns_error(code: u16, reason: Option<ErrorReason>) -> a2::Error {
        a2::Error::ResponseError(a2::Response {
            error: reason.map(|reason| a2::ErrorBody {
                reason,
                timestamp: None,
            }),
            apns_id: None,
            code,
        })
    }

    #[test]
    fn validates_tokens_per_platform() {
        let apns = "ab12".repeat(16);
        assert!(Platform::Ios.valid_token(&apns));
        assert!(Platform::IosSandbox.valid_token("AB12cd"));
        assert!(!Platform::Ios.valid_token(""));
        assert!(!Platform::Ios.valid_token("xyz"));
        assert!(!Platform::Ios.valid_token(&"a".repeat(201)));
        assert!(Platform::Android.valid_token("dXNlcjpwYXNz-_9:APA91bF"));
        assert!(!Platform::Android.valid_token(""));
        assert!(!Platform::Android.valid_token("a/b"));
        assert!(!Platform::Android.valid_token("a b"));
        assert!(!Platform::Android.valid_token(&"a".repeat(513)));
    }

    #[test]
    fn parses_platforms() {
        assert_eq!(Platform::parse("ios"), Some(Platform::Ios));
        assert_eq!(Platform::parse("ios-sandbox"), Some(Platform::IosSandbox));
        assert_eq!(Platform::parse("android"), Some(Platform::Android));
        assert_eq!(Platform::parse("web"), None);
    }

    #[test]
    fn apns_gets_a_mutable_alert_with_the_ciphertext() {
        let delivery = Delivery {
            ttl: Some(60),
            urgent: true,
        };
        let payload = apns_payload("abcd", "eu.owops.sowocial", "AQI=", &delivery, 1000);
        assert_eq!(payload.options.apns_expiration, Some(1060));
        assert_eq!(payload.options.apns_topic, Some("eu.owops.sowocial"));
        assert!(matches!(
            payload.options.apns_push_type,
            Some(PushType::Alert)
        ));
        assert!(matches!(
            payload.options.apns_priority,
            Some(Priority::High)
        ));
        let json: Value = serde_json::from_str(&payload.to_json_string().unwrap()).unwrap();
        assert_eq!(json["aps"]["alert"]["title"], "sowocial");
        assert_eq!(json["aps"]["alert"]["body"], "New notification");
        assert_eq!(json["aps"]["mutable-content"], 1);
        assert_eq!(json["aps"]["sound"], "default");
        assert_eq!(json["m"], "AQI=");
    }

    #[test]
    fn fcm_gets_a_data_only_message() {
        let delivery = Delivery {
            ttl: Some(172_800),
            urgent: true,
        };
        let message = fcm_message("tok", "AQI=", &delivery);
        assert_eq!(message["message"]["token"], "tok");
        assert_eq!(message["message"]["data"]["m"], "AQI=");
        assert_eq!(message["message"]["android"]["priority"], "high");
        assert_eq!(message["message"]["android"]["ttl"], "172800s");
        assert!(message["message"].get("notification").is_none());
    }

    #[test]
    fn urgency_and_ttl_reach_the_upstream_options() {
        let delivery = Delivery {
            ttl: None,
            urgent: false,
        };
        let payload = apns_payload("abcd", "t", "AQI=", &delivery, 1000);
        assert!(matches!(
            payload.options.apns_priority,
            Some(Priority::Normal)
        ));
        assert_eq!(payload.options.apns_expiration, None);
        let message = fcm_message("tok", "AQI=", &delivery);
        assert_eq!(message["message"]["android"]["priority"], "normal");
        assert!(message["message"]["android"].get("ttl").is_none());
    }

    #[test]
    fn parses_ttl_and_urgency_headers() {
        let headers = |pairs: &[(&'static str, &'static str)]| {
            let mut map = HeaderMap::new();
            for (name, value) in pairs {
                map.insert(*name, value.parse().unwrap());
            }
            map
        };
        let parse = |pairs| Delivery::from_headers(&headers(pairs));
        assert_eq!(
            parse(&[]),
            Some(Delivery {
                ttl: None,
                urgent: true
            })
        );
        assert_eq!(
            parse(&[("ttl", "172800"), ("urgency", "normal")]),
            Some(Delivery {
                ttl: Some(172_800),
                urgent: true
            })
        );
        assert_eq!(
            parse(&[("ttl", "0"), ("urgency", "very-low")]),
            Some(Delivery {
                ttl: Some(0),
                urgent: false
            })
        );
        assert_eq!(
            parse(&[("ttl", "99999999999")]),
            Some(Delivery {
                ttl: Some(MAX_TTL_SECS),
                urgent: true
            })
        );
        assert_eq!(parse(&[("ttl", "soon")]), None);
        assert_eq!(parse(&[("urgency", "asap")]), None);
    }

    #[test]
    fn maps_apns_errors_to_web_push_statuses() {
        assert_eq!(
            status_for_apns(&apns_error(410, Some(ErrorReason::Unregistered))),
            StatusCode::GONE
        );
        assert_eq!(
            status_for_apns(&apns_error(400, Some(ErrorReason::BadDeviceToken))),
            StatusCode::GONE
        );
        assert_eq!(
            status_for_apns(&apns_error(429, Some(ErrorReason::TooManyRequests))),
            StatusCode::TOO_MANY_REQUESTS
        );
        assert_eq!(
            status_for_apns(&apns_error(403, Some(ErrorReason::InvalidProviderToken))),
            StatusCode::BAD_GATEWAY
        );
        assert_eq!(
            status_for_apns(&apns_error(500, None)),
            StatusCode::BAD_GATEWAY
        );
        assert_eq!(
            status_for_apns(&a2::Error::RequestTimeout(20)),
            StatusCode::BAD_GATEWAY
        );
    }

    #[test]
    fn maps_fcm_errors_to_web_push_statuses() {
        let unregistered = json!({ "error": {
            "code": 404,
            "status": "NOT_FOUND",
            "details": [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", "errorCode": "UNREGISTERED" }],
        } });
        assert_eq!(
            status_for_fcm(StatusCode::NOT_FOUND, &unregistered),
            StatusCode::GONE
        );
        let wrong_project = json!({ "error": { "code": 404, "status": "NOT_FOUND" } });
        assert_eq!(
            status_for_fcm(StatusCode::NOT_FOUND, &wrong_project),
            StatusCode::BAD_GATEWAY
        );
        let bad_token = json!({ "error": {
            "code": 400,
            "status": "INVALID_ARGUMENT",
            "details": [{ "fieldViolations": [{ "field": "message.token" }] }],
        } });
        assert_eq!(
            status_for_fcm(StatusCode::BAD_REQUEST, &bad_token),
            StatusCode::GONE
        );
        let bad_payload = json!({ "error": {
            "code": 400,
            "status": "INVALID_ARGUMENT",
            "details": [{ "fieldViolations": [{ "field": "message.data" }] }],
        } });
        assert_eq!(
            status_for_fcm(StatusCode::BAD_REQUEST, &bad_payload),
            StatusCode::BAD_GATEWAY
        );
        assert_eq!(
            status_for_fcm(StatusCode::TOO_MANY_REQUESTS, &Value::Null),
            StatusCode::TOO_MANY_REQUESTS
        );
        assert_eq!(
            status_for_fcm(StatusCode::UNAUTHORIZED, &Value::Null),
            StatusCode::BAD_GATEWAY
        );
    }

    #[tokio::test]
    async fn refuses_bad_requests_before_calling_upstream() {
        let app = app(Arc::new(relay()));
        let ios_token = "ab".repeat(32);
        let request = |uri: &str, encoding: &str, body: Vec<u8>| {
            Request::post(uri)
                .header("content-encoding", encoding)
                .body(Body::from(body))
                .unwrap()
        };
        let cases = [
            (
                request("/push/web/abcd", "aes128gcm", vec![1]),
                StatusCode::NOT_FOUND,
            ),
            (
                request("/push/ios/nope", "aes128gcm", vec![1]),
                StatusCode::NOT_FOUND,
            ),
            (
                request("/push/android/a%2Fb", "aes128gcm", vec![1]),
                StatusCode::NOT_FOUND,
            ),
            (
                request(&format!("/push/ios/{ios_token}"), "aesgcm", vec![1]),
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
            ),
            (
                request(&format!("/push/ios/{ios_token}"), "aes128gcm", vec![]),
                StatusCode::BAD_REQUEST,
            ),
            (
                request(
                    &format!("/push/ios/{ios_token}"),
                    "aes128gcm",
                    vec![0; MAX_BODY_BYTES + 1],
                ),
                StatusCode::PAYLOAD_TOO_LARGE,
            ),
            (
                Request::post(format!("/push/ios/{ios_token}"))
                    .header("content-encoding", "aes128gcm")
                    .header("ttl", "soon")
                    .body(Body::from(vec![1]))
                    .unwrap(),
                StatusCode::BAD_REQUEST,
            ),
            (
                request(&format!("/push/ios/{ios_token}"), "aes128gcm", vec![1]),
                StatusCode::SERVICE_UNAVAILABLE,
            ),
            (
                request(
                    &format!("/push/ios-sandbox/{ios_token}"),
                    "aes128gcm",
                    vec![1],
                ),
                StatusCode::SERVICE_UNAVAILABLE,
            ),
            (
                request("/push/android/abc:def_g-h", "aes128gcm", vec![1]),
                StatusCode::SERVICE_UNAVAILABLE,
            ),
        ];
        for (request, expected) in cases {
            let response = app.clone().oneshot(request).await.map(|r| r.status());
            assert_eq!(response.ok(), Some(expected));
        }
    }

    #[tokio::test]
    async fn registers_and_removes_bluesky_subscriptions() {
        let relay = Relay {
            bsky: Arc::new(
                bsky::Registry::load(
                    None,
                    100,
                    Some("https://sowocial-push.ow-ops.eu".to_owned()),
                )
                .unwrap(),
            ),
            ..relay()
        };
        let app = app(Arc::new(relay));
        let endpoint = format!(
            "https://sowocial-push.ow-ops.eu/push/ios/{}",
            "ab".repeat(32)
        );
        let body = |did: &str| {
            json!({
                "did": did,
                "endpoint": endpoint,
                "p256dh": "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
                "auth": "BTBZMqHH6r4Tts7J_aSIgg",
            })
            .to_string()
        };
        let put = |body: String| {
            Request::put("/bsky/subscriptions")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap()
        };
        let status = |request: Request<Body>| {
            let app = app.clone();
            async move { app.oneshot(request).await.map(|r| r.status()) }
        };

        assert_eq!(
            status(put(body("did:plc:owner"))).await.ok(),
            Some(StatusCode::NO_CONTENT)
        );
        assert_eq!(
            status(put(body("alice.example"))).await.ok(),
            Some(StatusCode::BAD_REQUEST)
        );
        let removal = json!({ "did": "did:plc:owner", "endpoint": endpoint }).to_string();
        let delete = |body: String| {
            Request::delete("/bsky/subscriptions")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap()
        };
        assert_eq!(
            status(delete(removal.clone())).await.ok(),
            Some(StatusCode::NO_CONTENT)
        );
        assert_eq!(
            status(delete(removal)).await.ok(),
            Some(StatusCode::NOT_FOUND)
        );
    }
}
