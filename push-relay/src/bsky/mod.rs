//! Bluesky notifications. Bluesky has no Web Push, so the relay watches the public Jetstream
//! stream and encrypts each notification to the devices registered for the affected DID.

mod cache;
mod endpoint;
mod event;
mod stream;

use std::collections::BTreeMap;
use std::error::Error;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::MethodRouter;
use serde::{Deserialize, Serialize};
use tokio::sync::Notify;
use tracing::warn;
use web_push_native::{Auth, p256};

use crate::Relay;
use endpoint::{Hosts, Target, decode_keys, target, valid_did};

/// Failures before an external endpoint is dropped; the first 404 or 410 drops it at once.
const MAX_FAILURES: u32 = 5;
const MAX_PER_DID: usize = 10;
/// How long a change waits for others before the registry is written, so a burst is one write.
const PERSIST_DELAY: Duration = Duration::from_secs(2);
/// The stream position is recorded at most this often while events flow.
const CURSOR_INTERVAL: Duration = Duration::from_secs(5);
/// A saved position older than this is ignored, so a long outage does not replay a large backlog
/// as a burst of stale notifications.
const CURSOR_MAX_AGE: Duration = Duration::from_mins(15);

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The Bluesky settings, all read from the environment in one place.
pub(crate) struct Config {
    /// The relay's own address, so a registration for it goes straight to APNs or FCM.
    pub(crate) public_url: Option<String>,
    pub(crate) subscriptions_file: Option<PathBuf>,
    pub(crate) max_subscriptions: usize,
    pub(crate) jetstream_url: String,
}

impl Config {
    pub(crate) fn from_env() -> Result<Self, Box<dyn Error>> {
        Self::from_lookup(crate::env_var)
    }

    fn from_lookup(var: impl Fn(&str) -> Option<String>) -> Result<Self, Box<dyn Error>> {
        let subscriptions_file = var("BSKY_SUBSCRIPTIONS_FILE").map(PathBuf::from);
        if subscriptions_file.is_none() {
            warn!("BSKY_SUBSCRIPTIONS_FILE is not set: Bluesky registrations are lost on restart");
        }
        Ok(Self {
            public_url: var("PUBLIC_URL"),
            subscriptions_file,
            max_subscriptions: match var("BSKY_MAX_SUBSCRIPTIONS") {
                Some(value) => value.parse()?,
                None => 100_000,
            },
            jetstream_url: var("JETSTREAM_URL")
                .unwrap_or_else(|| stream::DEFAULT_JETSTREAM.to_owned()),
        })
    }
}

/// Reads the settings, loads the registrations and starts the Jetstream consumer and the file
/// writer. `build` makes the relay around the registry, because the consumer delivers through
/// the relay.
pub(crate) fn start(
    build: impl FnOnce(Arc<Registry>) -> Result<Relay, Box<dyn Error>>,
) -> Result<Arc<Relay>, Box<dyn Error>> {
    let config = Config::from_env()?;
    let registry = Arc::new(Registry::load(
        config.subscriptions_file,
        config.max_subscriptions,
        config.public_url,
    )?);
    let relay = Arc::new(build(registry)?);
    relay.bsky.spawn_writer();
    tokio::spawn(stream::run(relay.clone(), config.jetstream_url));
    Ok(relay)
}

/// One device's delivery target for one DID as registered and as stored in the file. The keys
/// are the device's public P-256 key and auth secret, both base64url.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Subscription {
    did: String,
    endpoint: String,
    p256dh: String,
    auth: String,
}

/// The Jetstream `seq` of the last event handled and the wall-clock time (Unix milliseconds) it
/// was handled, as stored in the cursor file.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Position {
    seq: u64,
    at_ms: u64,
}

impl Position {
    /// Whether the position is recent enough to resume from at `now_ms`.
    fn usable(self, now_ms: u64) -> bool {
        Duration::from_millis(now_ms.saturating_sub(self.at_ms)) < CURSOR_MAX_AGE
    }
}

fn unix_ms() -> u64 {
    let elapsed = SystemTime::now().duration_since(UNIX_EPOCH);
    u64::try_from(elapsed.unwrap_or_default().as_millis()).unwrap_or(u64::MAX)
}

/// The position saved in `path`, unless it is missing, unreadable, malformed or older than
/// `CURSOR_MAX_AGE` at `now_ms`.
fn read_position(path: &Path, now_ms: u64) -> Option<Position> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return None,
        Err(error) => {
            warn!(%error, "could not read the Jetstream cursor, starting at the live tail");
            return None;
        }
    };
    let Ok(position) = serde_json::from_slice::<Position>(&bytes) else {
        warn!("the Jetstream cursor file is malformed, starting at the live tail");
        return None;
    };
    if !position.usable(now_ms) {
        warn!("the saved Jetstream cursor is too old, starting at the live tail");
        return None;
    }
    Some(position)
}

/// The position to persist and when it was last scheduled for writing.
#[derive(Default)]
struct Tracker {
    position: Option<Position>,
    marked: Option<Instant>,
}

/// A validated subscription, with the endpoint and keys parsed once instead of per delivery.
struct Device {
    subscription: Subscription,
    target: Target,
    public: p256::PublicKey,
    auth: Auth,
}

impl Device {
    /// `None` unless the DID, keys and endpoint all pass the registration rules.
    fn new(subscription: Subscription, public_url: Option<&str>) -> Option<Self> {
        if !valid_did(&subscription.did) {
            return None;
        }
        let (public, auth) = decode_keys(&subscription.p256dh, &subscription.auth)?;
        let target = target(&subscription.endpoint, public_url)?;
        Some(Self {
            subscription,
            target,
            public,
            auth,
        })
    }
}

#[derive(Debug)]
enum PutError {
    PerDid,
    Full,
}

struct Entry {
    device: Arc<Device>,
    failures: u32,
}

#[derive(Default)]
struct Store {
    by_did: BTreeMap<String, Vec<Entry>>,
    total: usize,
}

/// Registrations, kept in memory. A change marks them dirty and the task from `spawn_writer`
/// writes one JSON file shortly after, so the lock the firehose path reads under is never held
/// across file I/O. The stream position is written by the same task, to a sibling file.
pub(crate) struct Registry {
    store: Mutex<Store>,
    path: Option<PathBuf>,
    max_total: usize,
    public_url: Option<String>,
    hosts: Hosts,
    dirty: AtomicBool,
    changed: Notify,
    cursor_path: Option<PathBuf>,
    tracker: Mutex<Tracker>,
    cursor_dirty: AtomicBool,
    // Serializes the writer task with the flush on shutdown, which share one temporary file.
    file: Mutex<()>,
}

impl Registry {
    /// Loads the registrations from `path` when it exists. Without a path they last until the
    /// relay restarts.
    pub(crate) fn load(
        path: Option<PathBuf>,
        max_total: usize,
        public_url: Option<String>,
    ) -> Result<Self, Box<dyn Error>> {
        let mut store = Store::default();
        if let Some(path) = path.as_ref().filter(|path| path.exists()) {
            let saved: Vec<Subscription> = serde_json::from_slice(&fs::read(path)?)?;
            for subscription in saved {
                if let Some(device) = Device::new(subscription, public_url.as_deref()) {
                    store.insert(device);
                } else {
                    warn!("skipped a saved Bluesky registration that no longer validates");
                }
            }
        }
        let cursor_path = path.as_ref().map(|path| {
            let mut name = path.clone().into_os_string();
            name.push(".cursor");
            PathBuf::from(name)
        });
        let position = cursor_path
            .as_ref()
            .and_then(|path| read_position(path, unix_ms()));
        Ok(Self {
            store: Mutex::new(store),
            path,
            max_total,
            public_url,
            hosts: Hosts::default(),
            dirty: AtomicBool::new(false),
            changed: Notify::new(),
            cursor_path,
            tracker: Mutex::new(Tracker {
                position,
                marked: None,
            }),
            cursor_dirty: AtomicBool::new(false),
            file: Mutex::new(()),
        })
    }

    fn lock(&self) -> MutexGuard<'_, Store> {
        lock_unpoisoned(&self.store)
    }

    fn public_url(&self) -> Option<&str> {
        self.public_url.as_deref()
    }

    fn is_empty(&self) -> bool {
        self.lock().total == 0
    }

    fn is_registered(&self, did: &str) -> bool {
        self.lock().by_did.contains_key(did)
    }

    fn subscribers(&self, did: &str) -> Vec<Arc<Device>> {
        self.lock()
            .by_did
            .get(did)
            .map(|entries| entries.iter().map(|entry| entry.device.clone()).collect())
            .unwrap_or_default()
    }

    /// Adds the device, or replaces the keys of the same DID and endpoint.
    fn put(&self, device: Device) -> Result<(), PutError> {
        let subscription = &device.subscription;
        let mut store = self.lock();
        let entries = store.by_did.get(&subscription.did);
        let existing = entries.is_some_and(|entries| {
            entries
                .iter()
                .any(|e| e.device.subscription.endpoint == subscription.endpoint)
        });
        if !existing {
            if entries.is_some_and(|entries| entries.len() >= MAX_PER_DID) {
                return Err(PutError::PerDid);
            }
            if store.total >= self.max_total {
                return Err(PutError::Full);
            }
        }
        store.remove(&subscription.did, &subscription.endpoint);
        store.insert(device);
        drop(store);
        self.mark_dirty();
        Ok(())
    }

    /// Removes the exact DID and endpoint pair. The endpoint holds the device token, which only
    /// the device knows.
    fn remove(&self, did: &str, endpoint: &str) -> bool {
        let removed = self.lock().remove(did, endpoint);
        if removed {
            self.mark_dirty();
        }
        removed
    }

    /// Records a failed delivery. `gone` drops the subscription at once; other failures drop it
    /// after `MAX_FAILURES` in a row.
    fn failed(&self, device: &Device, gone: bool) {
        let subscription = &device.subscription;
        let mut store = self.lock();
        let Some(entry) = store.entry_mut(subscription) else {
            return;
        };
        entry.failures += 1;
        if gone || entry.failures >= MAX_FAILURES {
            store.remove(&subscription.did, &subscription.endpoint);
            drop(store);
            self.mark_dirty();
        }
    }

    fn delivered(&self, device: &Device) {
        if let Some(entry) = self.lock().entry_mut(&device.subscription) {
            entry.failures = 0;
        }
    }

    fn mark_dirty(&self) {
        if self.path.is_some() {
            self.dirty.store(true, Ordering::Release);
            self.changed.notify_one();
        }
    }

    /// The `seq` to connect with: the last handled one while it is younger than `CURSOR_MAX_AGE`
    /// at `now_ms`, otherwise `None` for the live tail. A stale position is forgotten, so the
    /// caller's skip threshold restarts from the first live event.
    pub(crate) fn resume_seq(&self, now_ms: u64) -> Option<u64> {
        let mut tracker = lock_unpoisoned(&self.tracker);
        let position = tracker.position?;
        if position.usable(now_ms) {
            return Some(position.seq);
        }
        tracker.position = None;
        warn!("the last Jetstream position is too old, connecting at the live tail");
        None
    }

    /// Records the last handled `seq` and schedules a write at most once per `CURSOR_INTERVAL`.
    /// `now` is passed in so the throttle can be tested without sleeping.
    pub(crate) fn note_seq(&self, seq: u64, now: Instant) {
        let mut tracker = lock_unpoisoned(&self.tracker);
        tracker.position = Some(Position {
            seq,
            at_ms: unix_ms(),
        });
        let due = tracker
            .marked
            .is_none_or(|marked| now.duration_since(marked) >= CURSOR_INTERVAL);
        if due {
            tracker.marked = Some(now);
        }
        drop(tracker);
        if due && self.cursor_path.is_some() {
            self.cursor_dirty.store(true, Ordering::Release);
            self.changed.notify_one();
        }
    }

    /// Cheap under the lock: only reference counts are copied, the file is built outside it.
    fn snapshot(&self) -> Vec<Arc<Device>> {
        self.lock()
            .by_did
            .values()
            .flatten()
            .map(|entry| entry.device.clone())
            .collect()
    }

    fn write(&self, devices: &[Arc<Device>]) -> io::Result<()> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        let all: Vec<&Subscription> = devices.iter().map(|device| &device.subscription).collect();
        self.write_file(path, &serde_json::to_vec(&all)?)
    }

    fn write_cursor(&self) -> io::Result<()> {
        let Some(path) = &self.cursor_path else {
            return Ok(());
        };
        let position = lock_unpoisoned(&self.tracker).position;
        match position {
            Some(position) => self.write_file(path, &serde_json::to_vec(&position)?),
            None => Ok(()),
        }
    }

    /// Writes a temporary file and renames it over `path`, so a crash never leaves half a file.
    fn write_file(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        let _file = lock_unpoisoned(&self.file);
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, bytes)?;
        fs::rename(tmp, path)
    }

    /// Writes the current registrations and stream position now. The relay calls this on
    /// shutdown.
    pub(crate) fn flush(&self) -> io::Result<()> {
        self.dirty.store(false, Ordering::Release);
        self.cursor_dirty.store(false, Ordering::Release);
        let registrations = self.write(&self.snapshot());
        registrations.and(self.write_cursor())
    }

    /// Starts the task that writes the file after changes. Without a path there is nothing to
    /// write.
    pub(crate) fn spawn_writer(self: &Arc<Self>) {
        if self.path.is_some() {
            tokio::spawn(write_when_dirty(self.clone()));
        }
    }
}

async fn write_when_dirty(registry: Arc<Registry>) {
    loop {
        registry.changed.notified().await;
        tokio::time::sleep(PERSIST_DELAY).await;
        let registrations = registry.dirty.swap(false, Ordering::AcqRel);
        let cursor = registry.cursor_dirty.swap(false, Ordering::AcqRel);
        if !registrations && !cursor {
            continue;
        }
        let snapshot = registry.snapshot();
        let writer = registry.clone();
        let written = tokio::task::spawn_blocking(move || {
            let first = if registrations {
                writer.write(&snapshot)
            } else {
                Ok(())
            };
            let second = if cursor {
                writer.write_cursor()
            } else {
                Ok(())
            };
            first.and(second)
        })
        .await;
        if !matches!(written, Ok(Ok(()))) {
            warn!(?written, "could not persist the Bluesky state");
            // The next change tries again.
            registry.dirty.fetch_or(registrations, Ordering::AcqRel);
            registry.cursor_dirty.fetch_or(cursor, Ordering::AcqRel);
        }
    }
}

impl Store {
    fn insert(&mut self, device: Device) {
        self.total += 1;
        self.by_did
            .entry(device.subscription.did.clone())
            .or_default()
            .push(Entry {
                device: Arc::new(device),
                failures: 0,
            });
    }

    fn remove(&mut self, did: &str, endpoint: &str) -> bool {
        let Some(entries) = self.by_did.get_mut(did) else {
            return false;
        };
        let before = entries.len();
        entries.retain(|entry| entry.device.subscription.endpoint != endpoint);
        let removed = before - entries.len();
        if entries.is_empty() {
            self.by_did.remove(did);
        }
        self.total -= removed;
        removed > 0
    }

    fn entry_mut(&mut self, subscription: &Subscription) -> Option<&mut Entry> {
        self.by_did
            .get_mut(&subscription.did)?
            .iter_mut()
            .find(|entry| entry.device.subscription.endpoint == subscription.endpoint)
    }
}

async fn put_subscription(
    State(relay): State<Arc<Relay>>,
    Json(subscription): Json<Subscription>,
) -> StatusCode {
    let Some(device) = Device::new(subscription, relay.bsky.public_url()) else {
        return StatusCode::BAD_REQUEST;
    };
    let public = match &device.target {
        Target::Relay(..) => true,
        Target::External(url) => relay.bsky.hosts.is_public(url).await,
    };
    if !public {
        return StatusCode::BAD_REQUEST;
    }
    match relay.bsky.put(device) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(PutError::PerDid) => StatusCode::TOO_MANY_REQUESTS,
        Err(PutError::Full) => StatusCode::INSUFFICIENT_STORAGE,
    }
}

#[derive(Deserialize)]
struct Removal {
    did: String,
    endpoint: String,
}

async fn delete_subscription(
    State(relay): State<Arc<Relay>>,
    Json(removal): Json<Removal>,
) -> StatusCode {
    if relay.bsky.remove(&removal.did, &removal.endpoint) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

pub(crate) fn routes() -> MethodRouter<Arc<Relay>> {
    axum::routing::put(put_subscription).delete(delete_subscription)
}

#[cfg(test)]
mod tests {
    use super::*;

    // RFC 8291 Appendix A: the user agent's public key and auth secret.
    const P256DH: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";

    fn subscription(did: &str, endpoint: &str) -> Subscription {
        Subscription {
            did: did.to_owned(),
            endpoint: endpoint.to_owned(),
            p256dh: P256DH.to_owned(),
            auth: AUTH.to_owned(),
        }
    }

    fn device(did: &str, endpoint: &str) -> Device {
        Device::new(subscription(did, endpoint), None).expect("a valid device")
    }

    fn registrations(registry: &Registry, did: &str) -> Vec<Subscription> {
        registry
            .subscribers(did)
            .iter()
            .map(|device| device.subscription.clone())
            .collect()
    }

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("sowocial-bsky-{name}-{}.json", std::process::id()))
    }

    fn saved(path: &PathBuf) -> Option<Vec<Subscription>> {
        serde_json::from_slice(&fs::read(path).ok()?).ok()
    }

    #[test]
    fn reads_the_bluesky_settings_in_one_place() {
        let env = |pairs: &'static [(&str, &str)]| {
            move |name: &str| {
                pairs
                    .iter()
                    .find(|(key, _)| *key == name)
                    .map(|(_, value)| (*value).to_owned())
            }
        };
        let defaults = Config::from_lookup(env(&[])).unwrap();
        assert_eq!(defaults.max_subscriptions, 100_000);
        assert_eq!(defaults.jetstream_url, stream::DEFAULT_JETSTREAM);
        assert!(defaults.public_url.is_none() && defaults.subscriptions_file.is_none());

        let set = Config::from_lookup(env(&[
            ("PUBLIC_URL", "https://relay.example"),
            ("BSKY_SUBSCRIPTIONS_FILE", "/data/subs.json"),
            ("BSKY_MAX_SUBSCRIPTIONS", "7"),
            ("JETSTREAM_URL", "wss://jetstream.example"),
        ]))
        .unwrap();
        assert_eq!(set.public_url.as_deref(), Some("https://relay.example"));
        assert_eq!(
            set.subscriptions_file,
            Some(PathBuf::from("/data/subs.json"))
        );
        assert_eq!(set.max_subscriptions, 7);
        assert_eq!(set.jetstream_url, "wss://jetstream.example");

        assert!(Config::from_lookup(env(&[("BSKY_MAX_SUBSCRIPTIONS", "many")])).is_err());
    }

    #[test]
    fn caps_subscriptions_per_did_and_in_total() {
        let registry = Registry::load(None, 11, None).unwrap();
        for n in 0..MAX_PER_DID {
            registry
                .put(device("did:plc:a", &format!("https://e.example/{n}")))
                .ok()
                .unwrap();
        }
        assert!(matches!(
            registry.put(device("did:plc:a", "https://e.example/extra")),
            Err(PutError::PerDid)
        ));
        // Replacing the keys of an existing endpoint does not count against the cap.
        assert!(
            registry
                .put(device("did:plc:a", "https://e.example/0"))
                .is_ok()
        );
        registry
            .put(device("did:plc:b", "https://e.example/b"))
            .ok()
            .unwrap();
        assert!(matches!(
            registry.put(device("did:plc:c", "https://e.example/c")),
            Err(PutError::Full)
        ));
    }

    #[test]
    fn persists_registrations_across_restarts() {
        let path = temp_path("persist");
        let _ = fs::remove_file(&path);
        let kept = subscription("did:plc:a", "https://e.example/kept");
        let dropped = subscription("did:plc:a", "https://e.example/dropped");
        {
            let registry = Registry::load(Some(path.clone()), 100, None).unwrap();
            registry
                .put(Device::new(kept.clone(), None).unwrap())
                .ok()
                .unwrap();
            registry
                .put(Device::new(dropped.clone(), None).unwrap())
                .ok()
                .unwrap();
            assert!(registry.remove("did:plc:a", &dropped.endpoint));
            assert!(!registry.remove("did:plc:a", "https://e.example/other"));
            registry.flush().unwrap();
        }
        let reloaded = Registry::load(Some(path.clone()), 100, None).unwrap();
        assert_eq!(registrations(&reloaded, "did:plc:a"), vec![kept]);
        assert!(reloaded.is_registered("did:plc:a"));
        assert!(!reloaded.is_registered("did:plc:b"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn skips_saved_registrations_that_no_longer_validate() {
        let path = temp_path("stale");
        let good = subscription("did:plc:a", "https://e.example/good");
        let bad = subscription("did:plc:a", "http://e.example/plain");
        fs::write(&path, serde_json::to_vec(&[&good, &bad]).unwrap()).unwrap();
        let registry = Registry::load(Some(path.clone()), 100, None).unwrap();
        assert_eq!(registrations(&registry, "did:plc:a"), vec![good]);
        let _ = fs::remove_file(&path);
    }

    #[tokio::test]
    async fn a_burst_of_changes_is_written_in_the_background() {
        let path = temp_path("debounce");
        let _ = fs::remove_file(&path);
        let registry = Arc::new(Registry::load(Some(path.clone()), 100, None).unwrap());
        registry.spawn_writer();
        for n in 0..MAX_PER_DID {
            registry
                .put(device("did:plc:a", &format!("https://e.example/{n}")))
                .ok()
                .unwrap();
        }
        assert!(registry.remove("did:plc:a", "https://e.example/0"));
        // Nothing has been written inline; the writer task has not even run yet.
        assert!(!path.exists());

        let expected = registrations(&registry, "did:plc:a");
        assert_eq!(expected.len(), MAX_PER_DID - 1);
        let mut written = None;
        for _ in 0..100 {
            written = saved(&path);
            if written.as_ref() == Some(&expected) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert_eq!(written, Some(expected));
        assert!(!registry.dirty.load(Ordering::Acquire));
        let _ = fs::remove_file(&path);
    }

    fn cursor_file(path: &Path) -> PathBuf {
        PathBuf::from(format!("{}.cursor", path.display()))
    }

    #[test]
    fn the_stream_position_survives_a_restart() {
        let path = temp_path("cursor");
        let cursor = cursor_file(&path);
        let _ = fs::remove_file(&cursor);
        let registry = Registry::load(Some(path.clone()), 100, None).unwrap();
        assert_eq!(registry.resume_seq(unix_ms()), None);
        registry.note_seq(41, Instant::now());
        registry.flush().unwrap();
        assert_eq!(
            Registry::load(Some(path.clone()), 100, None)
                .unwrap()
                .resume_seq(unix_ms()),
            Some(41)
        );
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&cursor);
    }

    #[test]
    fn ignores_a_stale_or_malformed_cursor() {
        let path = temp_path("cursor-bad");
        let fresh = Position {
            seq: 9,
            at_ms: 1_000_000,
        };
        fs::write(&path, serde_json::to_vec(&fresh).unwrap()).unwrap();
        let max = u64::try_from(CURSOR_MAX_AGE.as_millis()).unwrap();
        assert_eq!(read_position(&path, 1_000_000 + max - 1), Some(fresh));
        assert_eq!(read_position(&path, 1_000_000 + max), None);
        fs::write(&path, b"not json").unwrap();
        assert_eq!(read_position(&path, 1_000_000), None);
        let _ = fs::remove_file(&path);
        assert_eq!(read_position(&path, 1_000_000), None);
    }

    #[test]
    fn schedules_a_cursor_write_at_most_once_per_interval() {
        let path = temp_path("cursor-throttle");
        let registry = Registry::load(Some(path), 100, None).unwrap();
        let start = Instant::now();
        let scheduled = || registry.cursor_dirty.swap(false, Ordering::AcqRel);
        registry.note_seq(1, start);
        assert!(scheduled());
        registry.note_seq(2, start + Duration::from_millis(4_999));
        assert!(!scheduled());
        registry.note_seq(3, start + CURSOR_INTERVAL);
        assert!(scheduled());
        // Throttled calls still keep the latest position for the shutdown flush.
        registry.note_seq(4, start + CURSOR_INTERVAL);
        assert!(!scheduled());
        assert_eq!(
            registry.tracker.lock().unwrap().position.map(|p| p.seq),
            Some(4)
        );
    }

    #[test]
    fn drops_gone_and_repeatedly_failing_endpoints() {
        let registry = Registry::load(None, 100, None).unwrap();
        let gone = device("did:plc:a", "https://e.example/gone");
        let flaky = device("did:plc:a", "https://e.example/flaky");
        let flaky_subscription = flaky.subscription.clone();
        registry
            .put(device("did:plc:a", "https://e.example/gone"))
            .ok()
            .unwrap();
        registry.put(flaky).ok().unwrap();
        let flaky = registry.subscribers("did:plc:a").remove(1);
        registry.failed(&gone, true);
        for _ in 0..MAX_FAILURES - 1 {
            registry.failed(&flaky, false);
        }
        registry.delivered(&flaky);
        for _ in 0..MAX_FAILURES - 1 {
            registry.failed(&flaky, false);
        }
        assert_eq!(
            registrations(&registry, "did:plc:a"),
            vec![flaky_subscription]
        );
        registry.failed(&flaky, false);
        assert_eq!(registrations(&registry, "did:plc:a"), Vec::new());
        assert!(registry.is_empty());
    }
}
