#!/bin/sh
# Starts a fresh GoToSocial, seeds it, and runs the Maestro flows against the app.
# Signing in resets the whole simulator keychain, so on iOS the flows only run on their own simulator.
# Extra arguments go to maestro itself, e.g. ./e2e/run.sh --device emulator-5554
set -eu
cd "$(dirname "$0")"

SIMULATOR=sowocial-e2e
simulator_udid() {
  xcrun simctl list devices | sed -n "s/^ *$SIMULATOR (\([0-9A-F-]*\)).*/\1/p" | head -n 1
}

device=
previous=
for argument; do
  [ "$previous" = --device ] && device=$argument
  previous=$argument
done

if [ -z "$device" ]; then
  device=$(simulator_udid)
  if [ -z "$device" ]; then
    type=$(xcrun simctl list -j runtimes | node -e '
      const runtimes = JSON.parse(require("fs").readFileSync(0)).runtimes.filter((r) => r.platform === "iOS" && r.isAvailable);
      console.log(runtimes.at(-1).supportedDeviceTypes.find((d) => d.productFamily === "iPhone").identifier);
    ')
    device=$(xcrun simctl create "$SIMULATOR" "$type")
  fi
  xcrun simctl bootstatus "$device" -b >/dev/null
  if ! xcrun simctl get_app_container "$device" eu.owops.sowocial >/dev/null 2>&1; then
    echo "No debug build on the $SIMULATOR simulator. Install one with: pnpm ios --device $device" >&2
    exit 1
  fi
  set -- --device "$device" "$@"
elif [ "$device" != "$(simulator_udid)" ] && xcrun simctl list devices 2>/dev/null | grep -q "($device)"; then
  echo "Refusing to run on this simulator: the flows reset its whole keychain. Run without --device to use $SIMULATOR." >&2
  exit 1
fi

docker compose down >/dev/null 2>&1 || true
docker compose up -d
until curl -sf http://localhost:8080/api/v1/instance >/dev/null; do sleep 1; done
env_args=$(node seed.mjs | sed 's/^/-e /')
# shellcheck disable=SC2086
maestro "$@" test $env_args flows
