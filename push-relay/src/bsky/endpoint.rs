//! What a registration may point at: the DID, the device keys and the delivery endpoint.

use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use web_push_native::{Auth, p256};

use super::cache::TtlCache;
use crate::Platform;

const MAX_ENDPOINT_BYTES: usize = 2048;
const HOST_TTL: Duration = Duration::from_secs(60);
const HOST_CACHE_MAX: usize = 10_000;

pub(super) fn valid_did(did: &str) -> bool {
    (did.starts_with("did:plc:") || did.starts_with("did:web:"))
        && did.len() <= 256
        && did
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'.' | b'_' | b'%' | b'-'))
}

/// The device's public key, an uncompressed P-256 point (65 bytes starting with 0x04), and its
/// 16-byte auth secret.
pub(super) fn decode_keys(p256dh: &str, auth: &str) -> Option<(p256::PublicKey, Auth)> {
    let public = URL_SAFE_NO_PAD
        .decode(p256dh)
        .ok()
        .filter(|bytes| bytes.len() == 65 && bytes.first() == Some(&0x04))?;
    let public = p256::PublicKey::from_sec1_bytes(&public).ok()?;
    let auth = URL_SAFE_NO_PAD
        .decode(auth)
        .ok()
        .filter(|bytes| bytes.len() == 16)?;
    Some((public, *Auth::from_slice(&auth)))
}

/// Where a Bluesky notification goes: one of the relay's own `/push` URLs, handed to APNs or FCM
/// directly, or an external `UnifiedPush` endpoint.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Target {
    Relay(Platform, String),
    External(reqwest::Url),
}

/// `PUBLIC_URL` is the relay's own address. The app percent-encodes FCM tokens, whose only
/// escaped character is `:`.
pub(super) fn target(endpoint: &str, public_url: Option<&str>) -> Option<Target> {
    if let Some(own) = public_url.and_then(|url| endpoint.strip_prefix(url.trim_end_matches('/'))) {
        let rest = own.strip_prefix("/push/")?;
        let (platform, token) = rest.split_once('/')?;
        let platform = Platform::parse(platform)?;
        let token = token.replace("%3A", ":").replace("%3a", ":");
        return platform
            .valid_token(&token)
            .then_some(Target::Relay(platform, token));
    }
    if endpoint.len() > MAX_ENDPOINT_BYTES {
        return None;
    }
    let url = reqwest::Url::parse(endpoint).ok()?;
    let plain = url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none();
    (plain && url.port().is_none_or(|port| port == 443)).then_some(Target::External(url))
}

/// Whether every address a host resolves to is public. Checked at registration and again
/// before each delivery, so a name that moves onto a private address stops receiving; the
/// verdict is kept for a minute so a busy endpoint is not resolved per notification.
pub(super) struct Hosts(TtlCache<bool>);

impl Default for Hosts {
    fn default() -> Self {
        Self(TtlCache::new(HOST_TTL, HOST_CACHE_MAX))
    }
}

impl Hosts {
    pub(super) async fn is_public(&self, url: &reqwest::Url) -> bool {
        let Some(host) = url.host_str() else {
            return false;
        };
        if let Some(verdict) = self.0.get(host) {
            return verdict;
        }
        let verdict = resolves_to_public(host).await;
        self.0.put(host, verdict);
        verdict
    }
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
            let [a, b, ..] = v4.octets();
            let private = a == 10 || (a == 172 && (16..32).contains(&b)) || (a == 192 && b == 168);
            !(v4.is_unspecified()
                || v4.is_loopback()
                || private
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_multicast()
                || a == 0
                || (a == 100 && (64..128).contains(&b)))
        }
        IpAddr::V6(v6) => {
            let first = v6.segments()[0];
            !(v6.is_unspecified()
                || v6.is_loopback()
                || v6.is_multicast()
                || first & 0xfe00 == 0xfc00
                || first & 0xffc0 == 0xfe80
                || v6
                    .to_ipv4_mapped()
                    .is_some_and(|v4| !is_public(IpAddr::V4(v4))))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // RFC 8291 Appendix A: the user agent's public key and auth secret.
    const P256DH: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";

    #[test]
    fn validates_did_and_keys() {
        assert!(valid_did("did:plc:7e6kocyzb77xkncplrkoojej"));
        assert!(valid_did("did:web:example.com"));
        assert!(!valid_did("alice.example"));
        assert!(!valid_did("did:key:z6Mk"));
        assert!(!valid_did("did:plc:a/b"));
        assert!(decode_keys(P256DH, AUTH).is_some());
        assert!(decode_keys(&URL_SAFE_NO_PAD.encode([4u8; 64]), AUTH).is_none());
        assert!(decode_keys(&URL_SAFE_NO_PAD.encode([3u8; 65]), AUTH).is_none());
        assert!(decode_keys(&URL_SAFE_NO_PAD.encode([4u8; 65]), AUTH).is_none());
        assert!(decode_keys(P256DH, &URL_SAFE_NO_PAD.encode([1u8; 15])).is_none());
    }

    #[test]
    fn classifies_endpoints() {
        let public = Some("https://sowocial-push.ow-ops.eu");
        let token = "ab".repeat(32);
        assert_eq!(
            target(
                &format!("https://sowocial-push.ow-ops.eu/push/ios/{token}"),
                public
            ),
            Some(Target::Relay(Platform::Ios, token.clone()))
        );
        assert_eq!(
            target(
                "https://sowocial-push.ow-ops.eu/push/android/dXNl%3Aabc-_9",
                public
            ),
            Some(Target::Relay(Platform::Android, "dXNl:abc-_9".to_owned()))
        );
        assert!(target("https://sowocial-push.ow-ops.eu/push/web/x", public).is_none());
        assert!(target("https://sowocial-push.ow-ops.eu/push/ios/nope", public).is_none());
        assert!(matches!(
            target("https://push.example.org/endpoint/1", public),
            Some(Target::External(_))
        ));
        assert!(target("http://push.example.org/endpoint/1", public).is_none());
        assert!(target("https://push.example.org:8443/endpoint/1", public).is_none());
        assert!(target("https://user:pass@push.example.org/endpoint/1", public).is_none());
        assert!(
            target("https://localhost/endpoint", None)
                .is_some_and(|t| matches!(t, Target::External(_)))
        );
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
        ] {
            assert!(!is_public(ip.parse().unwrap()), "{ip} should not be public");
        }
        for ip in ["8.8.8.8", "2606:4700::1111"] {
            assert!(is_public(ip.parse().unwrap()), "{ip} should be public");
        }
    }
}
