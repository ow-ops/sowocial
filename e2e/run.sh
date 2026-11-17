#!/bin/sh
# Starts a fresh GoToSocial, seeds it, and runs the Maestro flows against the app on the booted simulator.
# Extra arguments go to maestro itself, e.g. ./e2e/run.sh --device <udid>
set -eu
cd "$(dirname "$0")"
docker compose down >/dev/null 2>&1 || true
docker compose up -d
until curl -sf http://localhost:8080/api/v1/instance >/dev/null; do sleep 1; done
env_args=$(node seed.mjs | sed 's/^/-e /')
# shellcheck disable=SC2086
maestro "$@" test $env_args flows
