# sowocial

A GoToSocial and Bluesky client for iOS, Android and the web, by ow-ops. It also works with Mastodon and other servers that implement the Mastodon client API. You can sign in to fediverse and Bluesky accounts side by side and read both in one mixed home timeline.

## Get the app

- **Web**: [sowocial.ow-ops.eu](https://sowocial.ow-ops.eu)
- **Android**: install with Obtainium (below), or download the APK from the [releases](https://git.ow-ops.eu/ow-ops/sowocial/releases).
- **iOS and Google Play**: coming soon.

### Obtainium

Install [Obtainium](https://obtainium.imranr.dev), then tap **Add to Obtainium**. Stable and nightly have different package ids, so you can install both. To check the download, compare its signature with the fingerprint below using [AppVerifier](https://github.com/soupslurpr/AppVerifier).

**Stable**

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%7B%22id%22%3A%22eu.owops.sowocial%22%2C%22url%22%3A%22https%3A%2F%2Fgit.ow-ops.eu%2Fow-ops%2Fsowocial%22%2C%22author%22%3A%22ow-ops%22%2C%22name%22%3A%22sowocial%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20GoToSocial%20and%20Bluesky%20client%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22android-universal%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22Codeberg%22%7D"><img alt="Add to Obtainium" src="https://img.shields.io/badge/Add_to_Obtainium-6750A3?style=for-the-badge"></a>

```
eu.owops.sowocial
56:0B:C0:F3:63:C2:AC:6B:27:23:F7:8B:75:BA:14:0B:66:07:D2:B1:DE:49:5E:B5:53:0C:B1:DB:61:A8:47:7A
```

**Nightly**, built from every change to `main`:

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%7B%22id%22%3A%22eu.owops.sowocial.nightly%22%2C%22url%22%3A%22https%3A%2F%2Fgit.ow-ops.eu%2Fow-ops%2Fsowocial%22%2C%22author%22%3A%22ow-ops%22%2C%22name%22%3A%22sowocial%20Nightly%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22about%5C%22%3A%5C%22A%20GoToSocial%20and%20Bluesky%20client%20(nightly)%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22android-universal%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22includePrereleases%5C%22%3Atrue%2C%5C%22filterReleaseTitlesByRegEx%5C%22%3A%5C%22%5ENightly%20build%20%5C%22%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%7D%22%2C%22overrideSource%22%3A%22Codeberg%22%7D"><img alt="Add to Obtainium" src="https://img.shields.io/badge/Add_to_Obtainium-6750A3?style=for-the-badge"></a>

```
eu.owops.sowocial.nightly
56:0B:C0:F3:63:C2:AC:6B:27:23:F7:8B:75:BA:14:0B:66:07:D2:B1:DE:49:5E:B5:53:0C:B1:DB:61:A8:47:7A
```

## Privacy

No ads, analytics or tracking. Your posts stay between the app and your own server. Read the full [privacy policy](https://sowocial.ow-ops.eu/privacy).

## Feedback

Report bugs and ask for features in the [issues](https://git.ow-ops.eu/ow-ops/sowocial/issues).

## Building from source

```sh
pnpm install
npx expo run:ios      # or run:android
pnpm web
```

Native builds need the Rust link preview library first: see `modules/link-preview`, and run `pnpm ubrn:ios` or `pnpm ubrn:android` there. Sign-in uses the `sowocial://` scheme, so Expo Go cannot be used.

The GIF picker needs a [soliditas](https://git.sable.moe/SableClient/soliditas) server and a [Klipy](https://klipy.com) app key, set as `EXPO_PUBLIC_GIF_PROXY_URL` and `EXPO_PUBLIC_KLIPY_API_KEY` (in `.env.local` for local builds). Without them the GIF button is hidden. CI reads them from the `GIF_PROXY_URL` variable and the `KLIPY_API_KEY` secret.
