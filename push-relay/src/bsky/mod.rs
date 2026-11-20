//! Bluesky notifications. Bluesky has no Web Push, so the relay watches the public Jetstream
//! stream and encrypts each notification to the devices registered for the affected DID.

mod config;
mod endpoint;
mod event;
mod http;
mod persist;
mod registry;
mod stream;

use std::error::Error;
use std::io;
use std::sync::Arc;
use std::time::Duration;

use crate::delivery::Sender;
use config::Config;
pub(crate) use http::routes;
pub(crate) use registry::Registry;

/// The registrations and the delivery path their notifications take.
pub(crate) struct Bluesky {
    registry: Arc<Registry>,
    sender: Arc<Sender>,
}

impl Bluesky {
    pub(crate) fn new(registry: Arc<Registry>, sender: Arc<Sender>) -> Self {
        Self { registry, sender }
    }

    pub(crate) fn flush(&self) -> io::Result<()> {
        self.registry.flush()
    }
}

/// Reads the settings, loads the registrations and starts the Jetstream consumer and the file
/// writer.
pub(crate) fn start(sender: Arc<Sender>) -> Result<Arc<Bluesky>, Box<dyn Error>> {
    let config = Config::from_env()?;
    let registry = Arc::new(Registry::load(
        config.subscriptions_file,
        config.max_subscriptions,
        config.public_url,
    ));
    registry.spawn_writer();
    let bluesky = Arc::new(Bluesky::new(registry, sender));
    let profiles = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;
    tokio::spawn(stream::run(bluesky.clone(), config.jetstream_url, profiles));
    Ok(bluesky)
}
