use std::sync::LazyLock;
use std::time::Duration;

use reqwest::Certificate;
use sable_link_preview::{ReqwestFetch, scrape};
use url::Url;

uniffi::setup_scaffolding!();

static FETCH: LazyLock<Option<ReqwestFetch>> = LazyLock::new(|| {
    let roots = webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .filter_map(|der| Certificate::from_der(der).ok());
    let builder = reqwest::Client::builder()
        .user_agent(concat!("sowocial/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(10))
        .tls_certs_only(roots);
    ReqwestFetch::new(builder).ok()
});

/// The preview of `url` as Open Graph keys (with Sable's `note:` extension), in JSON.
#[uniffi::export(async_runtime = "tokio")]
pub async fn fetch_link_preview(url: String) -> Option<String> {
    let fetch = FETCH.as_ref()?;
    let preview = scrape(fetch, &Url::parse(&url).ok()?).await?;
    let tags = preview.to_matrix(ToString::to_string);
    Some(serde_json::Value::Object(tags).to_string())
}
