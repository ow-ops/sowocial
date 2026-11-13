//! Reads the Jetstream firehose and delivers a notification for each event that concerns a
//! registered DID.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::http::{HeaderValue, StatusCode, header};
use futures_util::future::join_all;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::Semaphore;
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};
use web_push_native::encrypt;

use super::cache::TtlCache;
use super::event::{self, Notice};
use super::{Device, Registry, Target, unix_ms, valid_did};
use crate::{Delivery, Relay};

pub(super) const DEFAULT_JETSTREAM: &str =
    "wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents";
const COLLECTIONS: [&str; 4] = [
    "app.bsky.feed.like",
    "app.bsky.feed.repost",
    "app.bsky.feed.post",
    "app.bsky.graph.follow",
];
const PROFILE_API: &str = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile";
const IDLE_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_BACKOFF: Duration = Duration::from_secs(60);
const NAME_TTL: Duration = Duration::from_secs(3600);
/// A failed lookup (404, 429, timeout) is not retried for this long.
const NAME_FAILURE_TTL: Duration = Duration::from_secs(60);
const FALLBACK_NAME: &str = "Someone";
const NAME_CACHE_MAX: usize = 10_000;
/// Events being delivered at once. The read loop only parses and matches; when this many are
/// in flight it drops the next notification instead of waiting, because a slow push endpoint
/// must never stall the firehose.
const MAX_IN_FLIGHT: usize = 256;
/// Notifications are worth delivering for a day; the device gets them when it comes back online.
const TTL_SECS: u64 = 24 * 60 * 60;

/// What the read loop shares with the delivery tasks it spawns.
struct Shared {
    relay: Arc<Relay>,
    /// Display names, so a busy account is looked up once an hour rather than once per
    /// notification.
    names: TtlCache<String>,
    /// Actors whose lookup just failed, so an outage or rate limit is not hit once per
    /// notification.
    failed_names: TtlCache<()>,
    in_flight: Arc<Semaphore>,
}

/// The notifications one event produced, ready to deliver.
struct Job {
    actor: String,
    notices: Vec<Notice>,
}

/// How one delivery attempt ended, applied to the registry in one place.
enum Outcome {
    Delivered,
    /// The device is gone for good: drop the registration.
    Gone,
    /// A failure that counts against the device.
    Retry,
    /// Nothing was attempted, so nothing counts against the device.
    Skipped,
}

/// Keeps a Jetstream connection open for the life of the relay, reconnecting with backoff and
/// resuming from the last event it handled, or from the position saved before a restart.
pub(super) async fn run(relay: Arc<Relay>, base: String) {
    let shared = Arc::new(Shared {
        relay,
        names: TtlCache::new(NAME_TTL, NAME_CACHE_MAX),
        failed_names: TtlCache::new(NAME_FAILURE_TTL, NAME_CACHE_MAX),
        in_flight: Arc::new(Semaphore::new(MAX_IN_FLIGHT)),
    });
    let mut last_seq;
    let mut backoff = Duration::from_secs(1);
    loop {
        last_seq = shared.relay.bsky.resume_seq(unix_ms());
        let url = subscribe_url(&base, last_seq);
        if let Err(error) = stream(&shared, &url, &mut last_seq, &mut backoff).await {
            warn!(%error, "Jetstream connection lost");
        }
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

/// The `subscribeEvents` query: commits for the collections the notifications come from.
fn subscribe_url(base: &str, cursor: Option<u64>) -> String {
    let mut params = vec!["kinds=commit".to_owned()];
    params.extend(
        COLLECTIONS
            .iter()
            .map(|collection| format!("collections={collection}")),
    );
    if let Some(seq) = cursor {
        params.push(format!("cursor={seq}"));
    }
    let separator = if base.contains('?') { '&' } else { '?' };
    format!("{base}{separator}{}", params.join("&"))
}

async fn stream(
    shared: &Arc<Shared>,
    url: &str,
    last_seq: &mut Option<u64>,
    backoff: &mut Duration,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (socket, _) = tokio_tungstenite::connect_async(url).await?;
    info!("connected to Jetstream");
    *backoff = Duration::from_secs(1);
    let (mut write, mut read) = socket.split();
    loop {
        // Jetstream keeps sending while there are commits, so silence means the socket is dead.
        match tokio::time::timeout(IDLE_TIMEOUT, read.next()).await? {
            None => return Ok(()),
            Some(message) => match message? {
                Message::Text(text) => dispatch(shared, text.as_str(), last_seq),
                Message::Ping(data) => write.send(Message::Pong(data)).await?,
                Message::Close(_) => return Ok(()),
                _ => {}
            },
        }
    }
}

/// Parses and matches one message, then hands the deliveries to their own task. Delivery is
/// at most once: the cursor moves on whether or not the notification gets through.
fn dispatch(shared: &Arc<Shared>, text: &str, last_seq: &mut Option<u64>) {
    let Some(job) = plan(&shared.relay.bsky, text, last_seq) else {
        return;
    };
    let Ok(permit) = shared.in_flight.clone().try_acquire_owned() else {
        warn!("too many notifications in flight, dropping one");
        return;
    };
    let shared = shared.clone();
    tokio::spawn(async move {
        process(&shared, job).await;
        drop(permit);
    });
}

fn plan(registry: &Registry, text: &str, last_seq: &mut Option<u64>) -> Option<Job> {
    let commit = event::parse_commit(text)?;
    // The cursor is inclusive, so the first event after a reconnect can repeat the last one.
    if last_seq.is_some_and(|seq| commit.seq <= seq) {
        return None;
    }
    *last_seq = Some(commit.seq);
    registry.note_seq(commit.seq, Instant::now());
    if registry.is_empty() {
        return None;
    }
    let notices = event::notices(&commit, |did| registry.is_registered(did));
    if notices.is_empty() {
        return None;
    }
    Some(Job {
        actor: commit.did.into_owned(),
        notices,
    })
}

async fn process(shared: &Shared, job: Job) {
    let relay = &*shared.relay;
    let actor = display_name(shared, &job.actor).await;
    let messages: Vec<(String, Vec<Arc<Device>>)> = job
        .notices
        .iter()
        .map(|notice| {
            (
                event::message(notice, &actor).to_string(),
                relay.bsky.subscribers(&notice.recipient),
            )
        })
        .collect();
    join_all(messages.iter().flat_map(|(plaintext, devices)| {
        devices
            .iter()
            .map(move |device| deliver(relay, device, plaintext.as_bytes()))
    }))
    .await;
}

async fn display_name(shared: &Shared, did: &str) -> String {
    if let Some(name) = shared.names.get(did) {
        return name;
    }
    if shared.failed_names.get(did).is_some() {
        return FALLBACK_NAME.to_owned();
    }
    if let Some(name) = fetch_name(&shared.relay, did).await {
        shared.names.put(did, name.clone());
        return name;
    }
    shared.failed_names.put(did, ());
    FALLBACK_NAME.to_owned()
}

async fn fetch_name(relay: &Relay, did: &str) -> Option<String> {
    if !valid_did(did) {
        return None;
    }
    let response = relay
        .client
        .get(format!("{PROFILE_API}?actor={did}"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let profile: serde_json::Value = response.json().await.ok()?;
    let display = profile["displayName"]
        .as_str()
        .filter(|name| !name.trim().is_empty());
    display.or(profile["handle"].as_str()).map(str::to_owned)
}

/// Encrypts to the device with RFC 8291, hands the result to its endpoint and records how it
/// went.
async fn deliver(relay: &Relay, device: &Device, plaintext: &[u8]) {
    let outcome = send(relay, device, plaintext).await;
    match outcome {
        Outcome::Delivered => relay.bsky.delivered(device),
        Outcome::Gone => relay.bsky.failed(device, true),
        Outcome::Retry => relay.bsky.failed(device, false),
        Outcome::Skipped => {}
    }
}

async fn send(relay: &Relay, device: &Device, plaintext: &[u8]) -> Outcome {
    let ciphertext = match encrypt(plaintext.to_vec(), &device.public, &device.auth) {
        Ok(ciphertext) => ciphertext,
        Err(error) => {
            warn!(%error, "could not encrypt a Bluesky notification");
            return Outcome::Skipped;
        }
    };
    match &device.target {
        Target::Relay(platform, token) => {
            let delivery = Delivery {
                ttl: Some(TTL_SECS),
                urgent: true,
            };
            match relay
                .forward(*platform, token, &ciphertext, &delivery)
                .await
            {
                StatusCode::CREATED => Outcome::Delivered,
                StatusCode::GONE => Outcome::Gone,
                // Not configured on this relay: nothing was attempted.
                StatusCode::SERVICE_UNAVAILABLE => Outcome::Skipped,
                other => {
                    warn!(status = %other, "could not deliver a Bluesky notification");
                    Outcome::Retry
                }
            }
        }
        Target::External(url) => send_external(relay, url, ciphertext).await,
    }
}

async fn send_external(relay: &Relay, url: &reqwest::Url, ciphertext: Vec<u8>) -> Outcome {
    if !relay.bsky.hosts.is_public(url).await {
        return Outcome::Retry;
    }
    let response = relay
        .client
        .post(url.clone())
        .header(
            header::CONTENT_ENCODING,
            HeaderValue::from_static("aes128gcm"),
        )
        .header(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/octet-stream"),
        )
        .header("TTL", TTL_SECS)
        .header("Urgency", "high")
        .body(ciphertext)
        .send()
        .await;
    match response {
        Ok(response) if response.status().is_success() => Outcome::Delivered,
        Ok(response) if matches!(response.status(), StatusCode::NOT_FOUND | StatusCode::GONE) => {
            Outcome::Gone
        }
        Ok(response) => {
            warn!(status = %response.status(), "a UnifiedPush endpoint refused a notification");
            Outcome::Retry
        }
        Err(error) => {
            warn!(%error, "could not reach a UnifiedPush endpoint");
            Outcome::Retry
        }
    }
}

#[cfg(test)]
mod tests {
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use serde_json::json;
    use web_push_native::p256;

    use std::fs;
    use std::path::PathBuf;

    use super::super::{Position, Subscription, unix_ms};
    use super::*;

    #[test]
    fn builds_the_subscribe_url_with_a_cursor() {
        let url = subscribe_url(
            "wss://jetstream.example/xrpc/network.bsky.jetstream.subscribeEvents",
            Some(42),
        );
        assert_eq!(
            url,
            "wss://jetstream.example/xrpc/network.bsky.jetstream.subscribeEvents?kinds=commit&collections=app.bsky.feed.like&collections=app.bsky.feed.repost&collections=app.bsky.feed.post&collections=app.bsky.graph.follow&cursor=42"
        );
        assert!(
            subscribe_url(DEFAULT_JETSTREAM, None).ends_with("&collections=app.bsky.graph.follow")
        );
        assert!(subscribe_url("wss://x/y?a=b", None).starts_with("wss://x/y?a=b&kinds=commit"));
    }

    // RFC 8291 Appendix A, as the app's webpush-test.ts uses it.
    const UA_PRIVATE: &str = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
    const UA_PUBLIC: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const UA_AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";
    const RFC_HEADER: &str = concat!(
        "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z",
        "9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml",
        "mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz",
        "AC8wEqKK6PBru3jl7A8",
    );
    const RFC_CIPHERTEXT: &str = concat!(
        "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd",
        "irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs",
        "bI_0LpXMuGvnzQ",
    );

    fn ua_secret() -> p256::SecretKey {
        let bytes = URL_SAFE_NO_PAD.decode(UA_PRIVATE).expect("valid base64url");
        p256::SecretKey::from_slice(&bytes).expect("a P-256 scalar")
    }

    fn subscription() -> Subscription {
        Subscription {
            did: "did:plc:owner".to_owned(),
            endpoint: "https://push.example.org/endpoint".to_owned(),
            p256dh: UA_PUBLIC.to_owned(),
            auth: UA_AUTH.to_owned(),
        }
    }

    fn device() -> Device {
        Device::new(subscription(), None).expect("a valid device")
    }

    #[test]
    fn decrypts_the_rfc_8291_example() {
        let device = device();
        let mut body = URL_SAFE_NO_PAD.decode(RFC_HEADER).expect("valid base64url");
        body.extend(
            URL_SAFE_NO_PAD
                .decode(RFC_CIPHERTEXT)
                .expect("valid base64url"),
        );
        let plaintext =
            web_push_native::decrypt(body, &ua_secret(), &device.auth).expect("decrypts");
        assert_eq!(plaintext, b"When I grow up, I want to be a watermelon");
    }

    #[test]
    fn encrypts_for_the_device_keys() {
        let device = device();
        let plaintext = br#"{"did":"did:plc:owner","title":"Alice liked your post","body":""}"#;
        let ciphertext =
            encrypt(plaintext.to_vec(), &device.public, &device.auth).expect("encrypts");
        let decrypted =
            web_push_native::decrypt(ciphertext, &ua_secret(), &device.auth).expect("decrypts");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn rejects_keys_that_do_not_decode() {
        let mut bad = subscription();
        bad.auth = URL_SAFE_NO_PAD.encode([1u8; 8]);
        assert!(Device::new(bad, None).is_none());
    }

    fn like(seq: u64, actor: &str, author: &str) -> String {
        json!({
            "$type": "message",
            "payload": {
                "$type": "network.bsky.jetstream.subscribeEvents#commit",
                "did": actor,
                "seq": seq,
                "operation": "create",
                "collection": "app.bsky.feed.like",
                "record": { "subject": { "uri": format!("at://{author}/app.bsky.feed.post/1") } }
            }
        })
        .to_string()
    }

    fn registry() -> Registry {
        let registry = Registry::load(None, 100, None).expect("an empty registry");
        registry.put(device()).expect("registered");
        registry
    }

    #[test]
    fn plans_a_job_only_for_registered_recipients() {
        let registry = registry();
        let mut last_seq = None;
        assert!(
            plan(
                &registry,
                &like(1, "did:plc:actor", "did:plc:stranger"),
                &mut last_seq
            )
            .is_none()
        );
        let job = plan(
            &registry,
            &like(2, "did:plc:actor", "did:plc:owner"),
            &mut last_seq,
        )
        .expect("a job for the registered account");
        assert_eq!(job.actor, "did:plc:actor");
        assert_eq!(job.notices.len(), 1);
        assert_eq!(job.notices[0].recipient, "did:plc:owner");
        // Skipped events still advance the cursor.
        assert_eq!(last_seq, Some(2));
    }

    #[test]
    fn ignores_events_the_cursor_already_covers() {
        let registry = registry();
        let mut last_seq = Some(5);
        let text = like(5, "did:plc:actor", "did:plc:owner");
        assert!(plan(&registry, &text, &mut last_seq).is_none());
        assert_eq!(last_seq, Some(5));
        assert!(
            plan(
                &registry,
                &like(6, "did:plc:actor", "did:plc:owner"),
                &mut last_seq
            )
            .is_some()
        );
    }

    #[test]
    fn resumes_from_a_saved_position_and_skips_what_it_covers() {
        let path =
            std::env::temp_dir().join(format!("sowocial-bsky-resume-{}", std::process::id()));
        let cursor = PathBuf::from(format!("{}.cursor", path.display()));
        let saved = Position {
            seq: 5,
            at_ms: unix_ms(),
        };
        fs::write(&cursor, serde_json::to_vec(&saved).unwrap()).unwrap();
        let registry = Registry::load(Some(path), 100, None).expect("a registry");
        registry.put(device()).expect("registered");
        let _ = fs::remove_file(&cursor);

        let mut last_seq = registry.resume_seq(unix_ms());
        assert_eq!(last_seq, Some(5));
        assert!(subscribe_url("wss://x/y", last_seq).ends_with("&cursor=5"));
        for seq in [4, 5] {
            let text = like(seq, "did:plc:actor", "did:plc:owner");
            assert!(plan(&registry, &text, &mut last_seq).is_none());
        }
        let text = like(6, "did:plc:actor", "did:plc:owner");
        assert!(plan(&registry, &text, &mut last_seq).is_some());
        assert_eq!(registry.resume_seq(unix_ms()), Some(6));
    }

    #[test]
    fn reconnects_at_the_live_tail_once_the_position_is_too_old() {
        let registry = registry();
        let mut last_seq = None;
        let text = like(50, "did:plc:actor", "did:plc:owner");
        assert!(plan(&registry, &text, &mut last_seq).is_some());

        let later = unix_ms() + 15 * 60 * 1000;
        assert_eq!(registry.resume_seq(unix_ms()), Some(50));
        let mut last_seq = registry.resume_seq(later);
        assert_eq!(last_seq, None);
        assert!(!subscribe_url("wss://x/y", last_seq).contains("cursor"));
        // A live event numbered below the stale position is not skipped.
        let text = like(3, "did:plc:actor", "did:plc:owner");
        assert!(plan(&registry, &text, &mut last_seq).is_some());
    }

    #[test]
    fn plans_nothing_without_registrations() {
        let empty = Registry::load(None, 100, None).expect("an empty registry");
        let mut last_seq = None;
        assert!(
            plan(
                &empty,
                &like(1, "did:plc:actor", "did:plc:owner"),
                &mut last_seq
            )
            .is_none()
        );
        assert_eq!(last_seq, Some(1));
    }

    fn shared(permits: usize) -> Arc<Shared> {
        Arc::new(Shared {
            relay: Arc::new(Relay {
                client: reqwest::Client::new(),
                apns: None,
                fcm: None,
                bsky: Arc::new(registry()),
            }),
            names: TtlCache::new(NAME_TTL, NAME_CACHE_MAX),
            failed_names: TtlCache::new(NAME_FAILURE_TTL, NAME_CACHE_MAX),
            in_flight: Arc::new(Semaphore::new(permits)),
        })
    }

    #[tokio::test]
    async fn drops_a_notification_when_every_slot_is_busy() {
        let shared = shared(0);
        let mut last_seq = None;
        dispatch(
            &shared,
            &like(7, "did:plc:actor", "did:plc:owner"),
            &mut last_seq,
        );
        // The read loop moved on instead of waiting for a slot.
        assert_eq!(last_seq, Some(7));
        assert_eq!(shared.in_flight.available_permits(), 0);
    }

    #[tokio::test]
    async fn a_failed_name_lookup_is_remembered() {
        let shared = shared(1);
        // Not a DID, so the lookup fails without touching the network.
        let actor = "alice.example";
        assert!(shared.failed_names.get(actor).is_none());
        assert_eq!(display_name(&shared, actor).await, FALLBACK_NAME);
        assert!(shared.failed_names.get(actor).is_some());
        assert!(shared.names.get(actor).is_none());
        assert_eq!(display_name(&shared, actor).await, FALLBACK_NAME);

        shared.names.put("did:plc:known", "Alice".to_owned());
        assert_eq!(display_name(&shared, "did:plc:known").await, "Alice");
    }
}
