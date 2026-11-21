use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::http::StatusCode;
use push_delivery::Apns;
use push_delivery::apns_h2::request::payload::Payload;
use push_delivery::apns_h2::{
    DefaultNotificationBuilder, NotificationBuilder, NotificationOptions, Priority, PushType,
};
use serde_json::Value;

use super::{Delivery, status};
use crate::config::env_var;

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
        .title("sowocial")
        .body("New notification")
        .sound("default")
        .mutable_content()
        .build(token, options);
    payload
        .data
        .insert("m".into(), Value::String(message.to_owned()));
    payload
}

pub(super) async fn send(
    apns: &Apns,
    sandbox: bool,
    token: &str,
    message: &str,
    delivery: &Delivery,
) -> StatusCode {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs());
    let payload = apns_payload(token, apns.topic(), message, delivery, now);
    status(apns.send(sandbox, payload).await)
}

pub(super) fn load() -> Result<Option<Apns>, Box<dyn std::error::Error>> {
    let Some(key_file) = env_var("APNS_KEY_FILE") else {
        return Ok(None);
    };
    let key_id = env_var("APNS_KEY_ID").ok_or("APNS_KEY_ID is required with APNS_KEY_FILE")?;
    let team_id = env_var("APNS_TEAM_ID").ok_or("APNS_TEAM_ID is required with APNS_KEY_FILE")?;
    let key = std::fs::read(key_file)?;
    let topic = env_var("APNS_TOPIC").unwrap_or_else(|| "eu.owops.sowocial".to_owned());
    // apns-h2's own default
    let timeout = Duration::from_secs(20);
    Ok(Some(Apns::new(&key, &key_id, &team_id, &topic, timeout)?))
}

#[cfg(test)]
mod tests {
    use push_delivery::apns_h2::request::payload::PayloadLike;

    use super::*;

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
}
