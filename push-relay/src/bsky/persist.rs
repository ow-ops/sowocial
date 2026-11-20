use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;

use tracing::{error, warn};

use crate::cache::lock_unpoisoned;

use super::registry::{Device, Position, Registry, Subscription};

/// How long a change waits for others before the registry is written, so a burst is one write.
const PERSIST_DELAY: Duration = Duration::from_secs(2);

/// The position saved in `path`, unless it is missing, unreadable, malformed or older than
/// `CURSOR_MAX_AGE` at `now_ms`.
pub(super) fn read_position(path: &Path, now_ms: u64) -> Option<Position> {
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

/// The registrations saved in `path`. A file that cannot be read or parsed is renamed aside, so
/// the next write does not overwrite it, and the relay starts with none.
pub(super) fn read_subscriptions(path: &Path) -> Vec<Subscription> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Vec::new(),
        Err(error) => {
            set_aside(path, &error);
            return Vec::new();
        }
    };
    serde_json::from_slice(&bytes).unwrap_or_else(|error| {
        set_aside(path, &error);
        Vec::new()
    })
}

pub(super) fn set_aside(path: &Path, reason: &dyn std::fmt::Display) {
    let aside = path.with_extension("bad");
    match fs::rename(path, &aside) {
        Ok(()) => {
            error!(%reason, aside = %aside.display(), "the Bluesky registrations file is unusable, starting empty");
        }
        Err(error) => {
            error!(%reason, %error, "the Bluesky registrations file is unusable and could not be moved aside, starting empty");
        }
    }
}

impl Registry {
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

    /// Writes a temporary file, syncs it and renames it over `path`, so a crash never leaves half
    /// a file.
    fn write_file(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        let _file = lock_unpoisoned(&self.file);
        let tmp = path.with_extension("tmp");
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
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

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::Instant;

    use super::super::registry::fixtures::*;
    use super::super::registry::{CURSOR_MAX_AGE, MAX_PER_DID, unix_ms};
    use super::*;

    #[test]
    fn persists_registrations_across_restarts() {
        let path = temp_path("persist");
        let _ = fs::remove_file(&path);
        let kept = subscription("did:plc:a", "https://e.example/kept");
        let dropped = subscription("did:plc:a", "https://e.example/dropped");
        {
            let registry = Registry::load(Some(path.clone()), 100, None);
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
        let reloaded = Registry::load(Some(path.clone()), 100, None);
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
        let registry = Registry::load(Some(path.clone()), 100, None);
        assert_eq!(registrations(&registry, "did:plc:a"), vec![good]);
        let _ = fs::remove_file(&path);
    }

    #[tokio::test]
    async fn a_burst_of_changes_is_written_in_the_background() {
        let path = temp_path("debounce");
        let _ = fs::remove_file(&path);
        let registry = Arc::new(Registry::load(Some(path.clone()), 100, None));
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
        let registry = Registry::load(Some(path.clone()), 100, None);
        assert_eq!(registry.resume_seq(unix_ms()), None);
        registry.note_seq(41, Instant::now());
        registry.flush().unwrap();
        assert_eq!(
            Registry::load(Some(path.clone()), 100, None).resume_seq(unix_ms()),
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
    fn keeps_the_registrations_file_aside_when_it_cannot_be_parsed() {
        for (name, content) in [("truncated", &b"[{\"did\":\"did:plc"[..]), ("empty", b"")] {
            let path = temp_path(name);
            let aside = path.with_extension("bad");
            let _ = fs::remove_file(&aside);
            fs::write(&path, content).unwrap();
            let registry = Registry::load(Some(path.clone()), 100, None);
            assert!(registry.is_empty());
            assert!(!path.exists());
            assert_eq!(fs::read(&aside).unwrap(), content);
            let _ = fs::remove_file(&aside);
        }
    }

    #[test]
    fn a_write_replaces_the_file_whole() {
        let path = temp_path("replace");
        let registry = Registry::load(Some(path.clone()), 100, None);
        registry.write_file(&path, b"first, longer").unwrap();
        registry.write_file(&path, b"second").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second");
        assert!(!path.with_extension("tmp").exists());
        let _ = fs::remove_file(&path);
    }
}
