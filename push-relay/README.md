# sowocial push relay

Mastodon and GoToSocial deliver notifications as encrypted Web Push (RFC 8291, `aes128gcm`). Phones only receive pushes through APNs and FCM, so the server posts to `/push/{ios|android}/{Expo push token}` on this relay, which hands the payload to Expo's push service for that device.

The relay forwards the ciphertext untouched and stores nothing. The app holds the keys and decrypts on the device: on Android a background task (`src/push/background.ts`) decrypts and shows the notification, on iOS the notification service extension (`targets/push`) replaces the placeholder alert with the decrypted one. When Expo reports the device as gone, the relay answers `410 Gone` and the server drops the subscription.

## Run

```sh
cargo run                      # listens on 0.0.0.0:8080
docker build -t sowocial-push-relay . && docker run -p 8080:8080 sowocial-push-relay
```

| Variable | Default | |
|---|---|---|
| `BIND` | `0.0.0.0:8080` | Address to listen on |
| `EXPO_ACCESS_TOKEN` | none | Needed if Expo enhanced push security is on |
| `EXPO_PUSH_URL` | Expo's endpoint | For tests |

Serve it over HTTPS behind your usual reverse proxy.

## Setup

Push only works once all of this is done:

1. Deploy the relay and set `PUSH_RELAY_URL` in `src/push/config.ts`.
2. Run `npx eas-cli@latest init` so `app.json` gets `extra.eas.projectId`. Without it the app cannot get a push token.
3. Set `ios.appleTeamId` in `app.json`, then run `eas credentials` to create the APNs key and the provisioning for `eu.owops.sowocial` and the extension `eu.owops.sowocial.push`. The extension shares the app's keychain group through `keychain-access-groups`.
4. Create a Firebase project, add `google-services.json` and set `android.googleServicesFile` in `app.json`, then upload the FCM v1 service account key with `eas credentials`.
5. Build a new development or production binary. Push needs native code that Expo Go and older builds lack.

Mastodon only sends RFC 8291 when the subscription asks for it (`standard: true`, Mastodon 4.4+). Older Mastodon servers use the `aesgcm` draft, which the relay refuses with `415`. GoToSocial always uses RFC 8291.
