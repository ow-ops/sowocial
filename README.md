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

`.forgejo/workflows/android-release.yml` builds and signs the APK on the `docker` runner and publishes it with `FORGE_TOKEN`. The version code is the commit count. Nightly versions are the `app.json` version plus the commit count, such as `0.0.1.123`.

Signing uses three organisation secrets: `ANDROID_KEY_BASE64` (a base64 PKCS12 keystore), `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, shared by the store and the key.

## Store releases

Pushing a `v*` tag also sends the build to the stores, through the fastlane lanes in `fastlane/Fastfile`. Nightly builds from `main` go to TestFlight only.

- Google Play: the `android` job in `.forgejo/workflows/android-release.yml` builds the signed AAB after publishing the APK and uploads it to the internal track. It is skipped when `PLAY_SERVICE_ACCOUNT_JSON` is not set.
- TestFlight: the `ios` job in the same workflow runs on a runner labelled `macos`, for tags and for pushes to `main`. It builds the signed IPA and uploads it. Nightlies are built as the stable app, with its name and bundle id, and only the build number changes, because App Store Connect accepts at most three version parts. Only tags update the App Store listing. The job is skipped when any of the three App Store Connect secrets is not set. Promote builds to testers or the store from App Store Connect and the Play Console.

The Android version code and the iOS build number are the commit count, so they grow with every release. The version name comes from the tag. `scripts/ci/resolve-release.sh` computes all of it for both jobs. Release notes for Play come from `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` when that file exists. A build without one is uploaded without notes.

```sh
bundle install
bundle exec fastlane lanes
```

Lanes, each run as `bundle exec fastlane <platform> <lane>` after `expo prebuild`:

- `android build`: Gradle `bundleRelease`, signed with `ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.
- `android upload [aab:path] [track:internal]`: `upload_to_play_store` with `PLAY_SERVICE_ACCOUNT_JSON`.
- `ios build`: `build_app` on `ios/sowocial.xcworkspace`, exported for the App Store.
- `ios upload [ipa:path]`: `upload_to_testflight` with `APPLE_API_KEY`, `APPLE_API_ISSUER` and `APPLE_API_KEY_PATH`.

### iOS signing

`app.json` sets `ios.appleTeamId`, and the generated project uses automatic signing for the app, the share extension and the `targets/push` extension. The runner is a system daemon with no login keychain, so the job imports the certificates from `APPLE_CERTIFICATE` into a temporary keychain, with Apple's WWDR G3 intermediate, and deletes it when the job ends. `ios build` then passes `-allowProvisioningUpdates` with the App Store Connect key to `xcodebuild`, which signs with those certificates and creates the profiles for the three bundle ids.

### Secrets

Organisation secrets, besides `FORGE_TOKEN` and the three `ANDROID_KEY_*` ones above.

| Secret | Contents |
| --- | --- |
| `PLAY_SERVICE_ACCOUNT_JSON` | The JSON key of a Google Cloud service account, pasted as is. Invite its email in the Play Console under Users and permissions with release permissions on the app, and enable the Google Play Android Developer API in the Cloud project. |
| `APP_STORE_API_KEY_ID` | The Key ID of an App Store Connect API key. |
| `APP_STORE_API_ISSUER_ID` | The Issuer ID shown above the keys list in App Store Connect, under Users and Access, Integrations. |
| `APP_STORE_API_KEY_BASE64` | The downloaded `.p8` file, encoded with `base64 < AuthKey_XXXX.p8 \| tr -d '\n'`. Create the key with the Admin role, which Xcode needs to create the distribution certificate. |
| `APP_REVIEW_DEMO_USER` | The account App Review signs in with, as `name@server`. Optional. |
| `APP_REVIEW_DEMO_PASSWORD` | Its password. |
| `APPLE_CERTIFICATE` | A `.p12` with the Apple Development and Apple Distribution certificates and their private keys, exported from Keychain Access, encoded with `base64 < certificates.p12 \| tr -d '\n'`. Archives sign with the development one and exports with the distribution one. |
| `APPLE_CERTIFICATE_PASSWORD` | The password of that `.p12`. |

### One-time setup

- Create the app in App Store Connect with the bundle id `eu.owops.sowocial`, then publish the App Privacy answers in `fastlane/app_privacy.json` with `bundle exec fastlane ios privacy`. That lane logs in with an Apple ID, which the API key cannot replace, so run it once from a Mac. `app.json` sets `ITSAppUsesNonExemptEncryption` to `false`, so builds need no export compliance answer.
- Create the app in the Play Console with the package `eu.owops.sowocial`, then upload the first AAB by hand to any track. The API rejects uploads until the app has a first release. Build it with `bundle exec fastlane android build`, or take it from a CI run.
- Enrol in Play App Signing, using the existing keystore as the upload key. Play signs the installs with its own key, so the Obtainium APK and the Play app have different signatures and cannot update each other.
- Add testers in TestFlight and Play Console. The lanes upload only.
- In the Play Console, fill in the content rating, data safety, target audience, app access, ads and privacy policy forms. fastlane cannot set them.
- Upload screenshots and the Play feature graphic by hand. The lanes do not upload images, so upload `fastlane/metadata/android/en-US/images/icon.png` as the Play icon too.

Store text is kept in the repository and overwrites the consoles on each release. `fastlane/metadata/android` goes up with each AAB. `bundle exec fastlane ios metadata` sends the App Store listing and review notes from `fastlane/metadata/ios`, and the age rating from `fastlane/age_rating.json`.

### macOS runner

The `ios` job needs a Mac with Xcode, the command line tools (`xcode-select --install`) and [Homebrew](https://brew.sh), registered as a Forgejo runner in host mode. Open Xcode once and accept the licence (`sudo xcodebuild -license accept`, `xcodebuild -runFirstLaunch`) and install the iOS platform. Host mode has no isolation, so use a dedicated user or a machine that only runs this repository's jobs.

1. Install the runner with `brew install forgejo-runner`, then create its config with `mkdir -p /opt/homebrew/etc/forgejo-runner` and `forgejo-runner generate-config > /opt/homebrew/etc/forgejo-runner/config.yaml`.
2. In the organisation's settings under Actions, Runners, choose Create new runner. Put the URL, UUID and token in the `server.connections` section of the config:

   ```yaml
   server:
     connections:
       forgejo:
         url: https://git.ow-ops.eu/
         uuid: <uuid>
         token: <token>
   ```

3. Set the label in the same file: `runner.labels: ["macos:host"]`.
4. Run it as a launchd service with `brew services start forgejo-runner`. The service runs `forgejo-runner daemon --config /opt/homebrew/etc/forgejo-runner/config.yaml` with `/opt/homebrew/bin` on its `PATH`. Its log is `/opt/homebrew/var/log/forgejo-runner.log`.

Jobs run in `$HOME/.cache/act/` unless `host.workdir_parent` is set. The job installs Node, Rust targets, CocoaPods and Ruby itself, and removes the API key when it ends. The checked-out `ios/` and `vendor/` folders stay in the work directory and are regenerated by the next run.
