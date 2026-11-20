use std::error::Error;
use std::path::PathBuf;

use tracing::warn;

use crate::config::env_var;

use super::stream;

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
        Self::from_lookup(env_var)
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
