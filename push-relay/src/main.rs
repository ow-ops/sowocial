//! Relays RFC 8291 Web Push to APNs and FCM and turns Bluesky activity into the same kind of
//! push. The ciphertext is never read; the app decrypts it on the device.

mod bsky;
mod cache;
mod config;
mod delivery;
mod rate_limit;

use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::routing::get;
use tokio::signal::unix::{SignalKind, signal};
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

use bsky::Bluesky;
use delivery::{MAX_BODY_BYTES, Sender};
use rate_limit::rate_limited;

fn app(sender: Arc<Sender>, bluesky: Arc<Bluesky>) -> Router {
    Router::new()
        .route(
            "/push/{platform}/{token}",
            rate_limited(delivery::routes(), Duration::from_millis(10), 200).with_state(sender),
        )
        .route(
            "/bsky/subscriptions",
            rate_limited(bsky::routes(), Duration::from_secs(1), 10).with_state(bluesky),
        )
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .route("/health", get(|| async { "ok" }))
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
    // The relay enables rustls's ring provider and apns-h2 its aws-lc-rs one, so rustls cannot pick
    // a default by itself and the Jetstream connection would panic.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let sender = Arc::new(Sender::from_env()?);
    let bluesky = bsky::start(sender.clone())?;
    let addr: SocketAddr = env::var("BIND")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_owned())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(%addr, "sowocial push relay listening");
    let mut sigterm = signal(SignalKind::terminate())?;
    axum::serve(
        listener,
        app(sender, bluesky.clone()).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = sigterm.recv() => {}
        }
    })
    .await?;
    if let Err(error) = bluesky.flush() {
        error!(%error, "could not write the Bluesky registrations on shutdown");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::extract::ConnectInfo;
    use axum::http::{Request, StatusCode};
    use serde_json::json;
    use tower::ServiceExt;

    use super::*;

    fn app_with(public_url: Option<&str>) -> Router {
        let sender = Arc::new(Sender::unconfigured());
        let registry = bsky::Registry::load(None, 100, public_url.map(str::to_owned));
        let bluesky = Bluesky::new(Arc::new(registry), sender.clone());
        app(sender, Arc::new(bluesky))
    }

    fn from_client(mut request: Request<Body>) -> Request<Body> {
        let peer: SocketAddr = ([203, 0, 113, 1], 5000).into();
        request.extensions_mut().insert(ConnectInfo(peer));
        request
    }

    #[tokio::test]
    async fn refuses_bad_requests_before_calling_upstream() {
        let app = app_with(None);
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
            let response = app
                .clone()
                .oneshot(from_client(request))
                .await
                .map(|r| r.status());
            assert_eq!(response.ok(), Some(expected));
        }
    }

    #[tokio::test]
    async fn registers_and_removes_bluesky_subscriptions() {
        let app = app_with(Some("https://sowocial-push.ow-ops.eu"));
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
            async move { app.oneshot(from_client(request)).await.map(|r| r.status()) }
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

    #[tokio::test]
    async fn limits_requests_per_forwarded_client_not_per_claimed_address() {
        let app = app_with(None);
        let delete = |forwarded: String| {
            Request::delete("/bsky/subscriptions")
                .header("content-type", "application/json")
                .header("x-forwarded-for", forwarded)
                .body(Body::from(
                    r#"{"did":"did:plc:a","endpoint":"https://e.example/a"}"#,
                ))
                .unwrap()
        };
        let mut statuses = Vec::new();
        for n in 0..15 {
            let response = app
                .clone()
                .oneshot(delete(format!("198.51.100.{n}, 192.0.2.7")))
                .await
                .unwrap();
            statuses.push(response.status());
        }
        assert_eq!(statuses[0], StatusCode::NOT_FOUND);
        assert_eq!(statuses[14], StatusCode::TOO_MANY_REQUESTS);

        let other = app.oneshot(delete("192.0.2.8".to_owned())).await.unwrap();
        assert_eq!(other.status(), StatusCode::NOT_FOUND);
    }
}
