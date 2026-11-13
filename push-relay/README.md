# sowocial push relay

Mastodon and GoToSocial deliver notifications as encrypted Web Push (RFC 8291, `aes128gcm`). Phones only receive pushes through APNs and FCM, so the server posts to this relay, which hands the payload to APNs or FCM for that device.

| Route | Device token | Delivered through |
|---|---|---|
| `POST /push/ios/{token}` | APNs token (hex) | APNs production |
| `POST /push/ios-sandbox/{token}` | APNs token (hex) | APNs sandbox, for development-signed builds |
| `POST /push/android/{token}` | FCM registration token | FCM v1 |
| `PUT /bsky/subscriptions` | JSON `{ did, endpoint, p256dh, auth }` | Registers a Bluesky account for one device |
| `DELETE /bsky/subscriptions` | JSON `{ did, endpoint }` | Removes exactly that registration |

The relay forwards the ciphertext untouched and stores nothing for fediverse servers. The app decrypts it on the device. When APNs or FCM reports the device token as gone, the relay answers `410 Gone` and the server drops the subscription.

## Bluesky

Bluesky has no Web Push, so the relay does the server's job for Bluesky accounts. It reads Bluesky's public event stream (Jetstream) for likes, reposts, follows and posts. When one of them concerns a registered DID (a reply, mention, quote, like, repost or follow), it builds `{ did, title, body }`, encrypts it with RFC 8291 to that device's keys, and delivers it through APNs, FCM, or the device's UnifiedPush endpoint. The `did` tells the app which account to show it under. Registrations live in a JSON file, and the relay keeps only DID, endpoint and public keys. The file is written a moment after each change and on shutdown, so a registration acknowledged just before a crash may be lost. The relay also saves the Jetstream `seq` of the last event it handled, with the time it was handled, to the same path with a `.cursor` suffix (`{"seq":N,"at_ms":UNIX_MILLISECONDS}`), at most every 5 seconds and on shutdown. At start it resumes from that `seq` when it is less than 15 minutes old, so events during a restart or deploy are still pushed; an older, missing or malformed cursor means the live tail, and the same 15-minute limit applies to every reconnect, so a long network outage also reconnects at the live tail, so a long outage does not replay a large backlog as a burst of stale notifications. Jetstream's cursor is inclusive and delivery is at-least-once, so the relay skips any event at or below the last `seq` it handled; after a crash (not a graceful shutdown) up to 5 seconds of events are replayed and a few notifications may be pushed twice.

Only public events can be pushed, never direct messages. The relay cannot see a user's mutes, so a muted account can still trigger a push.

Registrations are not authenticated, because everything the relay pushes is public Bluesky data, so registering someone else's DID reveals nothing private. The real risks are abuse as a request cannon and unbounded growth, so the relay caps each DID at 10 subscriptions and the total at `BSKY_MAX_SUBSCRIPTIONS`. External endpoints must be `https` on port 443 and resolve only to public addresses, checked at registration and before each delivery. An endpoint that answers 404 or 410, or fails five deliveries in a row, is dropped. The endpoint holds the device token, so `DELETE` requires the exact pair.

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
| `PUBLIC_URL` | none | The relay's own address, e.g. `https://sowocial-push.ow-ops.eu`. Bluesky registrations for it go straight to APNs or FCM |
| `BSKY_SUBSCRIPTIONS_FILE` | none | JSON file that holds the Bluesky registrations. Without it they are lost on restart, and so is the stream position, so events during a restart are not pushed. The stream position is saved next to it as `<file>.cursor`. Mount a volume for it |
| `BSKY_MAX_SUBSCRIPTIONS` | `100000` | Total Bluesky subscriptions the relay accepts |
| `JETSTREAM_URL` | `wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents` | Jetstream v2 endpoint. The relay resumes from the last event it handled after a reconnect, and after a restart when the saved position is less than 15 minutes old; otherwise it starts from now |

A platform whose credentials are not set answers `503`, and the relay still starts. The relay contacts `api.push.apple.com` and `api.development.push.apple.com` for APNs, and `oauth2.googleapis.com` and `fcm.googleapis.com` for FCM. For Bluesky it contacts `jetstream.us-east.bsky.network` (over WebSocket), `public.api.bsky.app` for display names, and the external UnifiedPush endpoints that devices register.

Serve it over HTTPS behind your usual reverse proxy.

## Setup

Setup:

1. The `push-relay-image` workflow builds and pushes the relay image, which is served at `https://sowocial-push.ow-ops.eu`, the value of `PUSH_RELAY_URL` in `src/push/config.ts`.
2. In the Apple developer portal, create an APNs key (a `.p8` file) for team `NXLJ6G3CP7`. Note its key ID.
3. In the Firebase project, generate a service account key (Project settings, Service accounts, Generate new private key). The Android app reads `google-services.json`, which `app.json` references through `android.googleServicesFile`. The nightly package `eu.owops.sowocial.nightly` uses the same Firebase project.
4. Mount both files into the relay and point `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID` and `FCM_CREDENTIALS_FILE` at them.
5. Build a new development or production binary. Push needs native code that Expo Go lacks. Builds that registered Expo push tokens have to turn push off and on again.

Mastodon only sends RFC 8291 when the subscription asks for it (`standard: true`, Mastodon 4.4+). Older Mastodon servers use the `aesgcm` draft, which the relay refuses with `415`. GoToSocial always uses RFC 8291.
