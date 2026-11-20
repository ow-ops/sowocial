use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::sync::Notify;
use tracing::warn;
use web_push_native::{Auth, p256};

use crate::cache::lock_unpoisoned;

use super::endpoint::{Target, decode_keys, target, valid_did};
use super::persist::{read_position, read_subscriptions};

pub(super) const MAX_PER_DID: usize = 10;
/// The stream position is recorded at most this often while events flow.
const CURSOR_INTERVAL: Duration = Duration::from_secs(5);
/// A saved position older than this is ignored, so a long outage does not replay a large backlog
/// as a burst of stale notifications.
pub(super) const CURSOR_MAX_AGE: Duration = Duration::from_mins(15);

/// One device's delivery target for one DID as registered and as stored in the file. The keys
/// are the device's public P-256 key and auth secret, both base64url.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct Subscription {
    pub(super) did: String,
    pub(super) endpoint: String,
    pub(super) p256dh: String,
    pub(super) auth: String,
}

/// The Jetstream `seq` of the last event handled and the wall-clock time (Unix milliseconds) it
/// was handled, as stored in the cursor file.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct Position {
    pub(super) seq: u64,
    pub(super) at_ms: u64,
}

impl Position {
    /// Whether the position is recent enough to resume from at `now_ms`.
    pub(super) fn usable(self, now_ms: u64) -> bool {
        Duration::from_millis(now_ms.saturating_sub(self.at_ms)) < CURSOR_MAX_AGE
    }
}

pub(super) fn unix_ms() -> u64 {
    let elapsed = SystemTime::now().duration_since(UNIX_EPOCH);
    u64::try_from(elapsed.unwrap_or_default().as_millis()).unwrap_or(u64::MAX)
}

/// The position to persist and when it was last scheduled for writing.
#[derive(Default)]
pub(super) struct Tracker {
    pub(super) position: Option<Position>,
    pub(super) marked: Option<Instant>,
}

/// A validated subscription, with the endpoint and keys parsed once instead of per delivery.
pub(super) struct Device {
    pub(super) subscription: Subscription,
    pub(super) target: Target,
    pub(super) public: p256::PublicKey,
    pub(super) auth: Auth,
}

impl Device {
    /// `None` unless the DID, keys and endpoint all pass the registration rules.
    pub(super) fn new(subscription: Subscription, public_url: Option<&str>) -> Option<Self> {
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
pub(super) struct Full;

#[derive(Default)]
pub(super) struct Store {
    pub(super) by_did: BTreeMap<String, Vec<Arc<Device>>>,
    pub(super) total: usize,
}

/// Registrations, kept in memory. A change marks them dirty and the task from `spawn_writer`
/// writes one JSON file shortly after, so the lock the firehose path reads under is never held
/// across file I/O. The stream position is written by the same task, to a sibling file.
pub(crate) struct Registry {
    pub(super) store: Mutex<Store>,
    pub(super) path: Option<PathBuf>,
    pub(super) max_total: usize,
    public_url: Option<String>,
    pub(super) dirty: AtomicBool,
    pub(super) changed: Notify,
    pub(super) cursor_path: Option<PathBuf>,
    pub(super) tracker: Mutex<Tracker>,
    pub(super) cursor_dirty: AtomicBool,
    // Serializes the writer task with the flush on shutdown, which share one temporary file.
    pub(super) file: Mutex<()>,
}

impl Registry {
    /// Loads the registrations from `path` when it exists. A file that cannot be read or parsed
    /// is kept aside and the relay starts empty. Without a path the registrations last until the
    /// relay restarts.
    pub(crate) fn load(
        path: Option<PathBuf>,
        max_total: usize,
        public_url: Option<String>,
    ) -> Self {
        let mut store = Store::default();
        if let Some(path) = &path {
            for subscription in read_subscriptions(path) {
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
        Self {
            store: Mutex::new(store),
            path,
            max_total,
            public_url,
            dirty: AtomicBool::new(false),
            changed: Notify::new(),
            cursor_path,
            tracker: Mutex::new(Tracker {
                position,
                marked: None,
            }),
            cursor_dirty: AtomicBool::new(false),
            file: Mutex::new(()),
        }
    }

    pub(super) fn lock(&self) -> MutexGuard<'_, Store> {
        lock_unpoisoned(&self.store)
    }

    pub(super) fn public_url(&self) -> Option<&str> {
        self.public_url.as_deref()
    }

    pub(super) fn is_empty(&self) -> bool {
        self.lock().total == 0
    }

    pub(super) fn is_registered(&self, did: &str) -> bool {
        self.lock().by_did.contains_key(did)
    }

    pub(super) fn subscribers(&self, did: &str) -> Vec<Arc<Device>> {
        self.lock().by_did.get(did).cloned().unwrap_or_default()
    }

    /// Adds the device, or replaces the keys of the same DID and endpoint. A DID that already
    /// has `MAX_PER_DID` devices loses its oldest, so junk registrations cannot lock the owner
    /// out.
    pub(super) fn put(&self, device: Device) -> Result<(), Full> {
        let subscription = &device.subscription;
        let mut store = self.lock();
        let entries = store.by_did.get(&subscription.did);
        let existing = entries.is_some_and(|entries| {
            entries
                .iter()
                .any(|d| d.subscription.endpoint == subscription.endpoint)
        });
        if !existing {
            let oldest = entries
                .filter(|entries| entries.len() >= MAX_PER_DID)
                .map(|entries| entries[0].subscription.endpoint.clone());
            match oldest {
                Some(endpoint) => {
                    store.remove(&subscription.did, &endpoint);
                }
                None if store.total >= self.max_total => return Err(Full),
                None => {}
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
    pub(super) fn remove(&self, did: &str, endpoint: &str) -> bool {
        let removed = self.lock().remove(did, endpoint);
        if removed {
            self.mark_dirty();
        }
        removed
    }

    pub(super) fn mark_dirty(&self) {
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
    pub(super) fn snapshot(&self) -> Vec<Arc<Device>> {
        self.lock().by_did.values().flatten().cloned().collect()
    }
}

impl Store {
    pub(super) fn insert(&mut self, device: Device) {
        self.total += 1;
        self.by_did
            .entry(device.subscription.did.clone())
            .or_default()
            .push(Arc::new(device));
    }

    pub(super) fn remove(&mut self, did: &str, endpoint: &str) -> bool {
        let Some(entries) = self.by_did.get_mut(did) else {
            return false;
        };
        let before = entries.len();
        entries.retain(|device| device.subscription.endpoint != endpoint);
        let removed = before - entries.len();
        if entries.is_empty() {
            self.by_did.remove(did);
        }
        self.total -= removed;
        removed > 0
    }
}

#[cfg(test)]
pub(super) mod fixtures {
    use std::fs;
    use std::path::PathBuf;

    use super::*;

    // RFC 8291 Appendix A: the user agent's public key and auth secret.
    pub(in crate::bsky) const P256DH: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    pub(in crate::bsky) const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";

    pub(in crate::bsky) fn subscription(did: &str, endpoint: &str) -> Subscription {
        Subscription {
            did: did.to_owned(),
            endpoint: endpoint.to_owned(),
            p256dh: P256DH.to_owned(),
            auth: AUTH.to_owned(),
        }
    }

    pub(in crate::bsky) fn device(did: &str, endpoint: &str) -> Device {
        Device::new(subscription(did, endpoint), None).expect("a valid device")
    }

    pub(in crate::bsky) fn registrations(registry: &Registry, did: &str) -> Vec<Subscription> {
        registry
            .subscribers(did)
            .iter()
            .map(|device| device.subscription.clone())
            .collect()
    }

    pub(in crate::bsky) fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("sowocial-bsky-{name}-{}.json", std::process::id()))
    }

    pub(in crate::bsky) fn saved(path: &PathBuf) -> Option<Vec<Subscription>> {
        serde_json::from_slice(&fs::read(path).ok()?).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;

    #[test]
    fn caps_subscriptions_in_total() {
        let registry = Registry::load(None, 2, None);
        registry
            .put(device("did:plc:a", "https://e.example/a"))
            .unwrap();
        registry
            .put(device("did:plc:b", "https://e.example/b"))
            .unwrap();
        assert!(
            registry
                .put(device("did:plc:c", "https://e.example/c"))
                .is_err()
        );
        // Replacing the keys of an existing endpoint does not count against the cap.
        assert!(
            registry
                .put(device("did:plc:a", "https://e.example/a"))
                .is_ok()
        );
    }

    #[test]
    fn a_full_did_replaces_its_oldest_registration() {
        let registry = Registry::load(None, 100, None);
        for n in 0..MAX_PER_DID {
            registry
                .put(device("did:plc:a", &format!("https://e.example/{n}")))
                .unwrap();
        }
        registry
            .put(device("did:plc:a", "https://e.example/new"))
            .unwrap();
        let endpoints: Vec<String> = registrations(&registry, "did:plc:a")
            .into_iter()
            .map(|s| s.endpoint)
            .collect();
        assert_eq!(endpoints.len(), MAX_PER_DID);
        assert_eq!(endpoints[0], "https://e.example/1");
        assert_eq!(endpoints[MAX_PER_DID - 1], "https://e.example/new");
        assert_eq!(registry.lock().total, MAX_PER_DID);

        let full = Registry::load(None, MAX_PER_DID, None);
        for n in 0..MAX_PER_DID {
            full.put(device("did:plc:a", &format!("https://e.example/{n}")))
                .unwrap();
        }
        assert!(
            full.put(device("did:plc:a", "https://e.example/new"))
                .is_ok()
        );
    }

    #[test]
    fn schedules_a_cursor_write_at_most_once_per_interval() {
        let path = temp_path("cursor-throttle");
        let registry = Registry::load(Some(path), 100, None);
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
}
