#!/usr/bin/env bash
set -euo pipefail

count="$(git rev-list --count HEAD)"
if [ "${FORGEJO_REF_TYPE}" = tag ]; then
  echo "SOWOCIAL_CHANNEL=stable"
  echo "SOWOCIAL_VERSION=${FORGEJO_REF_NAME#v}"
  echo "TAG=${FORGEJO_REF_NAME}"
else
  echo "SOWOCIAL_CHANNEL=nightly"
  echo "SOWOCIAL_VERSION=$(node -p "require('./app.json').expo.version").${count}"
  echo "TAG=nightly-${count}"
fi
echo "SOWOCIAL_VERSION_CODE=${count}"
