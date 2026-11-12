#!/usr/bin/env bash
# Each ninja Gradle starts sizes itself to the node, so all compiles share COMPILE_JOBS slots.
while :; do
  for ((slot = 1; slot <= COMPILE_JOBS; slot++)); do
    exec {lock}> "${COMPILE_SLOTS}/${slot}"
    flock -n "${lock}" && exec ccache "$@"
    exec {lock}>&-
  done
  sleep 0.2
done
