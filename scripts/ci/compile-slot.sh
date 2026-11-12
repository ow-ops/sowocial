#!/usr/bin/env bash
# Every ninja that Gradle starts runs node-sized parallel jobs, so compiles share COMPILE_JOBS slots across all of them.
while :; do
  for ((slot = 1; slot <= COMPILE_JOBS; slot++)); do
    exec {lock}> "${COMPILE_SLOTS}/${slot}"
    # The compiler inherits the locked descriptor and holds the slot until it exits.
    flock -n "${lock}" && exec "$@"
    exec {lock}>&-
  done
  sleep 0.2
done
