//! Hands a Web Push ciphertext to a device: APNs for iOS, FCM for Android, or an external
//! endpoint the device registered. Knows nothing about where the ciphertext comes from.

mod apns;
mod fcm;
mod hosts;

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::routing::{MethodRouter, post};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use push_delivery::{Apns, Fcm, Outcome};
use tracing::{info, warn};

use hosts::{Hosts, external_client};

/// APNs and FCM both refuse payloads over 4096 bytes; base64 grows the body by a third.
pub(crate) const MAX_BODY_BYTES: usize = 2560;

/// FCM stores messages for at most four weeks.
const MAX_TTL_SECS: u64 = 4 * 7 * 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Platform {
    Ios,
    IosSandbox,
    Android,
}

impl Platform {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "ios" => Some(Self::Ios),
            "ios-sandbox" => Some(Self::IosSandbox),
            "android" => Some(Self::Android),
            _ => None,
        }
    }

    pub(crate) fn valid_token(self, token: &str) -> bool {
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

/// Mastodon and `GoToSocial` drop the subscription on 410, which is what an uninstalled app
/// should cause. 5xx and 429 make them retry.
fn status(outcome: Outcome) -> StatusCode {
    match outcome {
        Outcome::Delivered => StatusCode::CREATED,
        Outcome::Gone => StatusCode::GONE,
        Outcome::RateLimited => StatusCode::TOO_MANY_REQUESTS,
        Outcome::Failed => StatusCode::BAD_GATEWAY,
    }
}

/// RFC 8030 `TTL` and `Urgency` request headers.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Delivery {
    pub(crate) ttl: Option<u64>,
    pub(crate) urgent: bool,
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

pub(crate) struct Sender {
    hosts: Hosts,
    /// For deliveries to endpoints that devices registered, which must not be trusted.
    external: reqwest::Client,
    apns: Option<Apns>,
    fcm: Option<Fcm>,
}

impl Sender {
    pub(crate) fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let sender = Self {
            hosts: Hosts::default(),
            external: external_client()?,
            apns: apns::load()?,
            fcm: fcm::load()?,
        };
        info!(
            apns = sender.apns.is_some(),
            fcm = sender.fcm.is_some(),
            "providers configured"
        );
        Ok(sender)
    }

    #[cfg(test)]
    pub(crate) fn unconfigured() -> Self {
        Self {
            hosts: Hosts::default(),
            external: reqwest::Client::new(),
            apns: None,
            fcm: None,
        }
    }

    /// Whether every address the endpoint's host resolves to is public.
    pub(crate) async fn is_public(&self, url: &reqwest::Url) -> bool {
        self.hosts.is_public(url).await
    }

    /// Hands the ciphertext to APNs or FCM for one device. A platform whose credentials are not
    /// set answers 503.
    pub(crate) async fn forward(
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
                    apns::send(
                        apns,
                        platform == Platform::IosSandbox,
                        token,
                        &message,
                        delivery,
                    )
                    .await
                }
                None => StatusCode::SERVICE_UNAVAILABLE,
            },
            Platform::Android => match &self.fcm {
                Some(fcm) => fcm::send(fcm, token, &message, delivery).await,
                None => StatusCode::SERVICE_UNAVAILABLE,
            },
        }
    }

    /// Posts the ciphertext to an endpoint the device registered. Answers like `forward`:
    /// `503` means nothing was attempted.
    pub(crate) async fn forward_external(
        &self,
        url: &reqwest::Url,
        ciphertext: Vec<u8>,
        delivery: &Delivery,
    ) -> StatusCode {
        let Some(_slot) = self.hosts.acquire(url) else {
            warn!("too many deliveries to one endpoint host at once, skipping one");
            return StatusCode::SERVICE_UNAVAILABLE;
        };
        if !self.hosts.is_public(url).await {
            return StatusCode::BAD_GATEWAY;
        }
        let mut request = self
            .external
            .post(url.clone())
            .header(
                header::CONTENT_ENCODING,
                HeaderValue::from_static("aes128gcm"),
            )
            .header(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            )
            .header("Urgency", if delivery.urgent { "high" } else { "low" });
        if let Some(ttl) = delivery.ttl {
            request = request.header("TTL", ttl);
        }
        match request.body(ciphertext).send().await {
            Ok(response) if response.status().is_success() => StatusCode::CREATED,
            Ok(response)
                if matches!(response.status(), StatusCode::NOT_FOUND | StatusCode::GONE) =>
            {
                StatusCode::GONE
            }
            Ok(response) => {
                warn!(status = %response.status(), "a UnifiedPush endpoint refused a notification");
                StatusCode::BAD_GATEWAY
            }
            Err(error) => {
                warn!(%error, "could not reach a UnifiedPush endpoint");
                StatusCode::BAD_GATEWAY
            }
        }
    }
}

async fn push(
    State(sender): State<Arc<Sender>>,
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

    sender.forward(platform, &token, &body, &delivery).await
}

pub(crate) fn routes() -> MethodRouter<Arc<Sender>> {
    post(push)
}

#[cfg(test)]
mod tests {
    use push_delivery::apns_h2::Priority;

    use super::apns::apns_payload;
    use super::fcm::fcm_message;
    use super::*;

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

    #[tokio::test]
    async fn external_deliveries_are_refused_before_any_request() {
        let sender = Sender::unconfigured();
        let delivery = Delivery {
            ttl: Some(60),
            urgent: true,
        };
        let private = reqwest::Url::parse("https://localhost/endpoint").unwrap();
        assert_eq!(
            sender.forward_external(&private, vec![1], &delivery).await,
            StatusCode::BAD_GATEWAY
        );
        let slots: Vec<_> = (0..hosts::MAX_PER_HOST)
            .map(|_| sender.hosts.acquire(&private))
            .collect();
        assert_eq!(
            sender.forward_external(&private, vec![1], &delivery).await,
            StatusCode::SERVICE_UNAVAILABLE
        );
        drop(slots);
    }
}
