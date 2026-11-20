use axum::http::StatusCode;
use gcp_auth::{CustomServiceAccount, TokenProvider};
use serde_json::{Value, json};
use tracing::{debug, error, warn};

use super::Delivery;
use crate::config::env_var;

const FCM_SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";

pub(super) struct Fcm {
    account: CustomServiceAccount,
    url: String,
}

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

impl Fcm {
    pub(super) async fn send(
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

pub(super) fn load() -> Result<Option<Fcm>, Box<dyn std::error::Error>> {
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

#[cfg(test)]
mod tests {
    use serde_json::json;

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
}
