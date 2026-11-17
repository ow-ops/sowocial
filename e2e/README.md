# End-to-end tests

Maestro flows that run the app against a local GoToSocial seeded with known accounts and posts.

Needs Docker, Node, Maestro, and a debug build of the app on a booted iOS simulator (`pnpm ios`, with Metro running).

```sh
./e2e/run.sh --device <simulator udid>
```

`run.sh` starts a fresh server from `compose.yaml` (its storage lives in memory), seeds it with `seed.mjs`, and runs every flow in `flows/`. The app signs in as bob, who follows alice and carol.

To run one flow, seed first and pass the tokens it prints:

```sh
cd e2e && docker compose up -d && node seed.mjs
maestro --device <udid> test -e ALICE_TOKEN=... flows/new-posts-pill.yaml
```
