//! What a registration may point at: the DID, the device keys and the delivery endpoint.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use web_push_native::{Auth, p256};

use crate::delivery::Platform;

const MAX_ENDPOINT_BYTES: usize = 2048;

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
}
