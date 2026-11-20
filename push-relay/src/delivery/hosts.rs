use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::cache::{TtlCache, lock_unpoisoned};

const HOST_TTL: Duration = Duration::from_secs(60);
const HOST_CACHE_MAX: usize = 10_000;
const DELIVERY_TIMEOUT: Duration = Duration::from_secs(10);
/// Deliveries to one external host at once, so a host that never answers only delays itself.
pub(super) const MAX_PER_HOST: usize = 4;

/// Whether every address a host resolves to is public. Checked at registration and again
/// before each delivery, so a name that moves onto a private address stops receiving; the
/// verdict is kept for a minute so a busy endpoint is not resolved per notification. It also
/// counts the deliveries under way per host.
pub(super) struct Hosts {
    verdicts: TtlCache<bool>,
    in_flight: Mutex<HashMap<String, usize>>,
}

impl Default for Hosts {
    fn default() -> Self {
        Self {
            verdicts: TtlCache::new(HOST_TTL, HOST_CACHE_MAX),
            in_flight: Mutex::default(),
        }
    }
}

impl Hosts {
    pub(super) async fn is_public(&self, url: &reqwest::Url) -> bool {
        let Some(host) = url.host_str() else {
            return false;
        };
        if let Some(verdict) = self.verdicts.get(host) {
            return verdict;
        }
        let verdict = resolves_to_public(host).await;
        self.verdicts.put(host, verdict);
        verdict
    }

    /// A slot for one delivery to the URL's host, or `None` when the host already has
    /// `MAX_PER_HOST` under way.
    pub(super) fn acquire(&self, url: &reqwest::Url) -> Option<HostSlot<'_>> {
        let host = url.host_str()?;
        let mut in_flight = lock_unpoisoned(&self.in_flight);
        let count = in_flight.entry(host.to_owned()).or_default();
        if *count >= MAX_PER_HOST {
            return None;
        }
        *count += 1;
        Some(HostSlot {
            hosts: self,
            host: host.to_owned(),
        })
    }
}

pub(super) struct HostSlot<'a> {
    hosts: &'a Hosts,
    host: String,
}

impl Drop for HostSlot<'_> {
    fn drop(&mut self) {
        let mut in_flight = lock_unpoisoned(&self.hosts.in_flight);
        if let Some(count) = in_flight.get_mut(&self.host) {
            *count -= 1;
            if *count == 0 {
                in_flight.remove(&self.host);
            }
        }
    }
}

/// Resolves names for deliveries to external endpoints and drops every non-public address,
/// so the address connected to is the one checked even if DNS answers differently than it did
/// at registration.
struct PublicOnly;

impl reqwest::dns::Resolve for PublicOnly {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        Box::pin(async move {
            let addresses: Vec<SocketAddr> = tokio::net::lookup_host((name.as_str(), 0))
                .await?
                .filter(|address| is_public(address.ip()))
                .collect();
            if addresses.is_empty() {
                return Err("the host has no public address".into());
            }
            Ok(Box::new(addresses.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

/// The client for deliveries to external endpoints: no redirects and only public addresses.
pub(super) fn external_client() -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(DELIVERY_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .dns_resolver(Arc::new(PublicOnly))
        .build()
}

async fn resolves_to_public(host: &str) -> bool {
    let Ok(addresses) = tokio::net::lookup_host((host, 443)).await else {
        return false;
    };
    let addresses: Vec<SocketAddr> = addresses.collect();
    !addresses.is_empty() && addresses.iter().all(|address| is_public(address.ip()))
}

fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, c, _] = v4.octets();
            !(v4.is_unspecified()
                || v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || a == 0
                || (a == 100 && (64..128).contains(&b))
                || (a == 192 && b == 0 && c == 0)
                || (a == 198 && (18..20).contains(&b))
                || a >= 240)
        }
        IpAddr::V6(v6) => {
            let segments = v6.segments();
            let first = segments[0];
            !(v6.is_unspecified()
                || v6.is_loopback()
                || v6.is_multicast()
                || first & 0xfe00 == 0xfc00
                || first & 0xffc0 == 0xfe80
                || first == 0x2002
                || segments[..6] == [0x64, 0xff9b, 0, 0, 0, 0]
                || v6
                    .to_ipv4_mapped()
                    .is_some_and(|v4| !is_public(IpAddr::V4(v4))))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_deliveries_per_host() {
        let hosts = Hosts::default();
        let url = reqwest::Url::parse("https://push.example.org/a").unwrap();
        let other = reqwest::Url::parse("https://other.example.org/a").unwrap();
        let slots: Vec<_> = (0..MAX_PER_HOST).map(|_| hosts.acquire(&url)).collect();
        assert!(slots.iter().all(Option::is_some));
        assert!(hosts.acquire(&url).is_none());
        assert!(hosts.acquire(&other).is_some());
        drop(slots);
        assert!(hosts.acquire(&url).is_some());
        assert!(lock_unpoisoned(&hosts.in_flight).is_empty());
    }

    #[test]
    fn refuses_private_addresses() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "0.0.0.0",
            "100.64.0.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:10.0.0.1",
            "192.0.0.8",
            "198.18.0.1",
            "198.19.255.255",
            "240.0.0.1",
            "255.255.255.255",
            "64:ff9b::7f00:1",
            "2002:7f00:1::1",
        ] {
            assert!(!is_public(ip.parse().unwrap()), "{ip} should not be public");
        }
        for ip in ["8.8.8.8", "198.20.0.1", "192.0.1.1", "2606:4700::1111"] {
            assert!(is_public(ip.parse().unwrap()), "{ip} should be public");
        }
    }
}
