# sowocial

A GoToSocial and Bluesky client for iOS, Android and the web, by ow-ops. It also works with Mastodon and other servers that implement the Mastodon client API. You can sign in to fediverse and Bluesky accounts side by side and read both in one mixed home timeline.

## Development

```sh
pnpm install
npx expo run:ios      # or run:android
pnpm web
```

Fediverse sign-in redirects to `sowocial://oauth`, so native needs a development build; Expo Go cannot handle it.

Bluesky uses OAuth. Native and production web read their client metadata from `public/oauth-client-metadata.json` and `public/oauth-client-metadata-web.json`, served at `https://sowocial.ow-ops.eu`. On localhost the web app uses the atproto loopback client instead, which sends you to `127.0.0.1` and carries your signed-in accounts over. Sign-in can also use a password, which is the only option on web origins with no OAuth client.

Link previews come from [sable-link-preview](https://git.sable.moe/SableClient/link-preview), built into `modules/link-preview` with [uniffi-bindgen-react-native](https://github.com/jhugman/uniffi-bindgen-react-native). Build the Rust library before the native app, and again after changing the crate:

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim aarch64-linux-android x86_64-linux-android
cargo install cargo-ndk
cd modules/link-preview
pnpm ubrn:ios
ANDROID_NDK_HOME=$ANDROID_HOME/ndk/27.1.12297006 pnpm ubrn:android
```

Push notifications go through the relay in `push-relay/`. Its README lists what has to be set up first.

```sh
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

## Android releases

Pushing a `v*` tag publishes a stable release, and every push to `main` publishes a nightly prerelease. Each carries a signed APK for arm64-v8a and x86_64, and an `obtainium.json` app config. Stable and nightly have different package ids, so both can be installed.

### Obtainium

#### Stable

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%7B%22id%22%3A%22eu.owops.sowocial%22%2C%22url%22%3A%22https%3A%2F%2Fgit.ow-ops.eu%2Fow-ops%2Fsowocial%22%2C%22author%22%3A%22ow-ops%22%2C%22name%22%3A%22sowocial%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20GoToSocial%20and%20Bluesky%20client%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22android-universal%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22Codeberg%22%7D"><img alt="Add to Obtainium" src="https://img.shields.io/badge/Add_to_Obtainium-6750A3?style=for-the-badge"></a>
&nbsp;
<a href="https://git.ow-ops.eu/ow-ops/sowocial/releases/download/latest/obtainium.json"><img alt="App config" src="https://img.shields.io/badge/App_config-6B7280?style=for-the-badge"></a>

```
eu.owops.sowocial
56:0B:C0:F3:63:C2:AC:6B:27:23:F7:8B:75:BA:14:0B:66:07:D2:B1:DE:49:5E:B5:53:0C:B1:DB:61:A8:47:7A
```

#### Nightly

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%7B%22id%22%3A%22eu.owops.sowocial.nightly%22%2C%22url%22%3A%22https%3A%2F%2Fgit.ow-ops.eu%2Fow-ops%2Fsowocial%22%2C%22author%22%3A%22ow-ops%22%2C%22name%22%3A%22sowocial%20Nightly%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20GoToSocial%20and%20Bluesky%20client%20(nightly)%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22android-universal%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22includePrereleases%5C%22%3Atrue%2C%5C%22filterReleaseTitlesByRegEx%5C%22%3A%5C%22%5ENightly%20build%20%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22Codeberg%22%7D"><img alt="Add to Obtainium" src="https://img.shields.io/badge/Add_to_Obtainium-6750A3?style=for-the-badge"></a>
&nbsp;
<a href="https://git.ow-ops.eu/ow-ops/sowocial/releases/download/nightly/obtainium.json"><img alt="App config" src="https://img.shields.io/badge/App_config-6B7280?style=for-the-badge"></a>

```
eu.owops.sowocial.nightly
56:0B:C0:F3:63:C2:AC:6B:27:23:F7:8B:75:BA:14:0B:66:07:D2:B1:DE:49:5E:B5:53:0C:B1:DB:61:A8:47:7A
```

#### Setup

1. Install [Obtainium](https://obtainium.imranr.dev).
2. Tap **Add to Obtainium** above, using the nightly one for prereleases. Or download `obtainium.json` and import it with **Import/Export, Import from file**.
3. Optionally check the download against the fingerprint above with [AppVerifier](https://github.com/soupslurpr/AppVerifier).

## Web image

The `Dockerfile` exports the web build and serves it with Caddy on port 8080, with `/healthz` for probes. On every push to `main`, `.forgejo/workflows/web-image.yml` runs the checks above, then builds and pushes `git.ow-ops.eu/ow-ops/sowocial-web` tagged with the short commit SHA and `main`. It logs in to the registry as `owl-bot` with the organisation's `FORGE_TOKEN` secret.

## Android build

`.forgejo/workflows/android-release.yml` builds and signs the APK on the `docker` runner and publishes it with `FORGE_TOKEN`. The version code is the commit count. Nightly versions are the `app.json` version plus the commit count, such as `1.0.0.123`.

Signing uses three organisation secrets: `ANDROID_KEY_BASE64` (a base64 PKCS12 keystore), `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, shared by the store and the key.
