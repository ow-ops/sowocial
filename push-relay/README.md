# sowocial push relay

Mastodon and GoToSocial deliver notifications as encrypted Web Push (RFC 8291, `aes128gcm`). Phones only receive pushes through APNs and FCM, so the server posts to this relay, which hands the payload to APNs or FCM for that device.

| Route | Device token | Delivered through |
|---|---|---|
| `POST /push/ios/{token}` | APNs token (hex) | APNs production |
| `POST /push/ios-sandbox/{token}` | APNs token (hex) | APNs sandbox, for development-signed builds |
| `POST /push/android/{token}` | FCM registration token | FCM v1 |

The relay forwards the ciphertext untouched and stores nothing. The app decrypts it on the device. When APNs or FCM reports the device token as gone, the relay answers `410 Gone` and the server drops the subscription.

The `TTL` and `Urgency` request headers (RFC 8030) set the APNs expiration and priority and the FCM TTL and priority. Both `very-low` and `low` urgency use normal priority; anything else uses high priority.

## Run

```sh
cargo run                      # listens on 0.0.0.0:8080
docker build -t sowocial-push-relay . && docker run -p 8080:8080 sowocial-push-relay
```

| Variable | Default | |
|---|---|---|
| `BIND` | `0.0.0.0:8080` | Address to listen on |
| `APNS_KEY_FILE` | none | Path to the APNs `.p8` key |
| `APNS_KEY_ID` | none | Key ID of that key, required with `APNS_KEY_FILE` |
| `APNS_TEAM_ID` | none | Apple team ID, required with `APNS_KEY_FILE` |
| `APNS_TOPIC` | `eu.owops.sowocial` | Bundle ID of the iOS app |
| `FCM_CREDENTIALS_FILE` | none | Path to the Firebase service account JSON |

A platform whose credentials are not set answers `503`, and the relay still starts. The relay contacts `api.push.apple.com` and `api.development.push.apple.com` for APNs, and `oauth2.googleapis.com` and `fcm.googleapis.com` for FCM.

Serve it over HTTPS behind your usual reverse proxy.

## Setup

Setup:

1. The `push-relay-image` workflow builds and pushes the relay image, which is served at `https://sowocial-push.ow-ops.eu`, the value of `PUSH_RELAY_URL` in `src/push/config.ts`.
2. In the Apple developer portal, create an APNs key (a `.p8` file) for team `NXLJ6G3CP7`. Note its key ID.
3. In the Firebase project, generate a service account key (Project settings, Service accounts, Generate new private key). The Android app reads `google-services.json`, which `app.json` references through `android.googleServicesFile`. The nightly package `eu.owops.sowocial.nightly` uses the same Firebase project.
4. Mount both files into the relay and point `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID` and `FCM_CREDENTIALS_FILE` at them.
5. Build a new development or production binary. Push needs native code that Expo Go lacks. Builds that registered Expo push tokens have to turn push off and on again.

Mastodon only sends RFC 8291 when the subscription asks for it (`standard: true`, Mastodon 4.4+). Older Mastodon servers use the `aesgcm` draft, which the relay refuses with `415`. GoToSocial always uses RFC 8291.
