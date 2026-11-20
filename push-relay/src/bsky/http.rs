use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::MethodRouter;
use serde::Deserialize;

use super::Bluesky;
use super::endpoint::Target;
use super::registry::{Device, Full, Subscription};

async fn put_subscription(
    State(bluesky): State<Arc<Bluesky>>,
    Json(subscription): Json<Subscription>,
) -> StatusCode {
    let Some(device) = Device::new(subscription, bluesky.registry.public_url()) else {
        return StatusCode::BAD_REQUEST;
    };
    let public = match &device.target {
        Target::Relay(..) => true,
        Target::External(url) => bluesky.sender.is_public(url).await,
    };
    if !public {
        return StatusCode::BAD_REQUEST;
    }
    match bluesky.registry.put(device) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(Full) => StatusCode::INSUFFICIENT_STORAGE,
    }
}

#[derive(Deserialize)]
struct Removal {
    did: String,
    endpoint: String,
}

async fn delete_subscription(
    State(bluesky): State<Arc<Bluesky>>,
    Json(removal): Json<Removal>,
) -> StatusCode {
    if bluesky.registry.remove(&removal.did, &removal.endpoint) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

pub(crate) fn routes() -> MethodRouter<Arc<Bluesky>> {
    axum::routing::put(put_subscription).delete(delete_subscription)
}
