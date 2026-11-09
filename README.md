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

## Web image

The `Dockerfile` exports the web build and serves it with Caddy on port 8080, with `/healthz` for probes. On every push to `main`, `.forgejo/workflows/web-image.yml` runs the checks above, then builds and pushes `git.ow-ops.eu/ow-ops/sowocial-web` tagged with the short commit SHA and `main`. The workflow needs a `REGISTRY_TOKEN` secret that can write packages.
