use std::time::Duration;

use axum::http::StatusCode;
use push_delivery::Fcm;
use serde_json::{Value, json};

use super::{Delivery, status};
use crate::config::env_var;

/// Android gets a data-only message that the app's background task decrypts and shows.
pub(super) fn fcm_message(token: &str, message: &str, delivery: &Delivery) -> Value {
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

pub(super) async fn send(fcm: &Fcm, token: &str, message: &str, delivery: &Delivery) -> StatusCode {
    status(fcm.send(&fcm_message(token, message, delivery)).await)
}

pub(super) fn load() -> Result<Option<Fcm>, Box<dyn std::error::Error>> {
    let Some(credentials_file) = env_var("FCM_CREDENTIALS_FILE") else {
        return Ok(None);
    };
    Ok(Some(Fcm::from_file(
        credentials_file,
        Duration::from_secs(10),
    )?))
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
