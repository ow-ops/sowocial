//! A bounded map whose entries expire.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use super::lock_unpoisoned;

/// Every entry lives for the same `ttl`, so insertion order is also expiry order and both
/// eviction and expiry only ever look at the front of `order`.
pub(super) struct TtlCache<V> {
    ttl: Duration,
    max: usize,
    inner: Mutex<Inner<V>>,
}

struct Inner<V> {
    /// Each value carries the sequence number of the insertion that wrote it.
    entries: HashMap<Arc<str>, (u64, Instant, V)>,
    order: VecDeque<(u64, Instant, Arc<str>)>,
    next: u64,
}

impl<V> Inner<V> {
    /// Drops the oldest insertion. An entry whose key was overwritten since is only a stale
    /// marker and leaves the map alone. Returns false once nothing is left.
    fn pop_oldest(&mut self) -> bool {
        let Some((seq, _, key)) = self.order.pop_front() else {
            return false;
        };
        if self
            .entries
            .get(&key)
            .is_some_and(|(live, ..)| *live == seq)
        {
            self.entries.remove(&key);
        }
        true
    }
}

impl<V: Clone> TtlCache<V> {
    pub(super) fn new(ttl: Duration, max: usize) -> Self {
        Self {
            ttl,
            max,
            inner: Mutex::new(Inner {
                entries: HashMap::new(),
                order: VecDeque::new(),
                next: 0,
            }),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner<V>> {
        lock_unpoisoned(&self.inner)
    }

    fn fresh(&self, at: Instant, now: Instant) -> bool {
        now.saturating_duration_since(at) < self.ttl
    }

    pub(super) fn get(&self, key: &str) -> Option<V> {
        self.get_at(key, Instant::now())
    }

    pub(super) fn put(&self, key: &str, value: V) {
        self.put_at(key, value, Instant::now());
    }

    fn get_at(&self, key: &str, now: Instant) -> Option<V> {
        self.lock()
            .entries
            .get(key)
            .filter(|(_, at, _)| self.fresh(*at, now))
            .map(|(.., value)| value.clone())
    }

    /// Expired entries leave first, so a full cache keeps its live entries until it has to
    /// evict the oldest of them.
    fn put_at(&self, key: &str, value: V, now: Instant) {
        let mut inner = self.lock();
        while inner
            .order
            .front()
            .is_some_and(|(_, at, _)| !self.fresh(*at, now))
        {
            inner.pop_oldest();
        }
        if !inner.entries.contains_key(key) {
            while inner.entries.len() >= self.max && inner.pop_oldest() {}
        }
        let seq = inner.next;
        inner.next += 1;
        let key: Arc<str> = key.into();
        inner.order.push_back((seq, now, key.clone()));
        inner.entries.insert(key, (seq, now, value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cache() -> TtlCache<u32> {
        TtlCache::new(Duration::from_secs(10), 3)
    }

    #[test]
    fn entries_expire() {
        let cache = cache();
        let start = Instant::now();
        cache.put_at("a", 1, start);
        assert_eq!(cache.get_at("a", start + Duration::from_secs(9)), Some(1));
        assert_eq!(cache.get_at("a", start + Duration::from_secs(10)), None);
    }

    #[test]
    fn a_full_cache_drops_expired_entries_before_live_ones() {
        let cache = cache();
        let start = Instant::now();
        cache.put_at("old1", 1, start);
        cache.put_at("old2", 2, start + Duration::from_secs(1));
        cache.put_at("live", 3, start + Duration::from_secs(8));
        let now = start + Duration::from_secs(12);
        cache.put_at("new", 4, now);
        assert_eq!(cache.get_at("old1", now), None);
        assert_eq!(cache.get_at("old2", now), None);
        assert_eq!(cache.get_at("live", now), Some(3));
        assert_eq!(cache.get_at("new", now), Some(4));
    }

    #[test]
    fn a_full_cache_of_live_entries_evicts_only_the_oldest() {
        let cache = cache();
        let start = Instant::now();
        for (offset, key) in ["a", "b", "c"].into_iter().enumerate() {
            cache.put_at(key, 0, start + Duration::from_secs(offset as u64));
        }
        let now = start + Duration::from_secs(5);
        cache.put_at("d", 1, now);
        assert_eq!(cache.get_at("a", now), None);
        for key in ["b", "c", "d"] {
            assert!(cache.get_at(key, now).is_some(), "{key} should stay");
        }
    }

    #[test]
    fn overwriting_a_key_evicts_nothing() {
        let cache = cache();
        let start = Instant::now();
        for key in ["a", "b", "c"] {
            cache.put_at(key, 0, start);
        }
        cache.put_at("a", 9, start);
        assert_eq!(cache.get_at("a", start), Some(9));
        assert!(cache.get_at("b", start).is_some() && cache.get_at("c", start).is_some());
    }

    #[test]
    fn eviction_follows_insertion_order_even_after_an_overwrite() {
        let cache = cache();
        let start = Instant::now();
        for (offset, key) in ["a", "b", "c"].into_iter().enumerate() {
            cache.put_at(key, 0, start + Duration::from_secs(offset as u64));
        }
        // "a" is now the newest insertion, so "b" is the oldest.
        cache.put_at("a", 1, start + Duration::from_secs(3));
        cache.put_at("d", 2, start + Duration::from_secs(4));
        let now = start + Duration::from_secs(5);
        assert_eq!(cache.get_at("b", now), None);
        for key in ["a", "c", "d"] {
            assert!(cache.get_at(key, now).is_some(), "{key} should stay");
        }
        assert_eq!(cache.get_at("a", now), Some(1));
    }

    #[test]
    fn the_queue_does_not_outgrow_the_cap_under_churn() {
        let cache = cache();
        let start = Instant::now();
        for n in 0..50_u64 {
            cache.put_at(&format!("k{n}"), 0, start + Duration::from_millis(n));
        }
        let inner = cache.lock();
        assert_eq!(inner.entries.len(), 3);
        assert_eq!(inner.order.len(), 3);
    }
}
