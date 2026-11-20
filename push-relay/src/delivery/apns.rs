use std::time::{SystemTime, UNIX_EPOCH};

use a2::request::payload::Payload;
use a2::{
    DefaultNotificationBuilder, ErrorReason, NotificationBuilder, NotificationOptions, Priority,
    PushType,
};
use axum::http::StatusCode;
use serde_json::Value;
use tracing::{debug, warn};

use super::Delivery;
use crate::config::env_var;

pub(super) struct Apns {
    production: a2::Client,
    sandbox: a2::Client,
    topic: String,
}

/// iOS shows an alert only if one is sent, and runs the app's notification service
/// extension on it when `mutable-content` is set; the extension replaces the placeholder
/// text with the decrypted one.
pub(super) fn apns_payload<'a>(
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

impl Apns {
    pub(super) async fn send(
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

pub(super) fn load() -> Result<Option<Apns>, Box<dyn std::error::Error>> {
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

#[cfg(test)]
mod tests {
    use a2::request::payload::PayloadLike;

    use super::*;

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
}
