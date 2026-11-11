#!/usr/bin/env bash
set -euo pipefail

count="$(git rev-list --count HEAD)"
# A tag usually points at a commit main already built, and the stores take each build number once.
code=$((count * 10))
if [ "${FORGEJO_REF_TYPE}" = tag ]; then
  code=$((code + 1))
  echo "SOWOCIAL_CHANNEL=stable"
  echo "SOWOCIAL_VERSION=${FORGEJO_REF_NAME#v}"
  echo "TAG=${FORGEJO_REF_NAME}"
else
  echo "SOWOCIAL_CHANNEL=nightly"
  echo "SOWOCIAL_VERSION=$(node -p "require('./app.json').expo.version").${count}"
  echo "TAG=nightly-${count}"
fi
echo "SOWOCIAL_VERSION_CODE=${code}"
