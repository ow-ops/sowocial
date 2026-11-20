use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ConnectInfo;
use axum::http::Request;
use axum::routing::MethodRouter;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::KeyExtractor;
use tower_governor::{GovernorError, GovernorLayer};

/// The client behind the reverse proxy: the last `X-Forwarded-For` entry, which is the address
/// the proxy itself saw (earlier ones are whatever the client sent). Without the header, the
/// peer address.
#[derive(Clone)]
struct ClientIp;

impl KeyExtractor for ClientIp {
    type Key = IpAddr;

    fn extract<T>(&self, request: &Request<T>) -> Result<IpAddr, GovernorError> {
        let forwarded = request
            .headers()
            .get_all("x-forwarded-for")
            .iter()
            .next_back()
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.rsplit(',').next())
            .and_then(|entry| entry.trim().parse().ok());
        forwarded
            .or_else(|| {
                let peer = request.extensions().get::<ConnectInfo<SocketAddr>>();
                peer.map(|ConnectInfo(addr)| addr.ip())
            })
            .ok_or(GovernorError::UnableToExtractKey)
    }
}

/// Allows each client IP `burst` requests at once and one more every `period`.
pub(crate) fn rate_limited<S: Clone + Send + Sync + 'static>(
    route: MethodRouter<S>,
    period: Duration,
    burst: u32,
) -> MethodRouter<S> {
    let config = Arc::new(
        GovernorConfigBuilder::default()
            .period(period)
            .burst_size(burst)
            .key_extractor(ClientIp)
            .finish()
            .expect("a non-zero period and burst"),
    );
    let limiter = config.limiter().clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            limiter.retain_recent();
        }
    });
    route.layer(GovernorLayer::new(config))
}
