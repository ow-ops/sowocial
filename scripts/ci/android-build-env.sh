#!/usr/bin/env bash
set -euo pipefail

# Sizes the Android build to the pod's cgroup limits (nproc shows the whole node).
# Each C/C++ compile can take ~1.5 GiB; the Gradle and Kotlin daemons take about 5 GiB.
cpus="$(nproc)"
if read -r quota period < /sys/fs/cgroup/cpu.max 2> /dev/null && [ "${quota}" != max ]; then
  cpus=$(((quota + period - 1) / period))
fi

jobs="${cpus}"
memory="$(cat /sys/fs/cgroup/memory.max 2> /dev/null || echo max)"
if [ "${memory}" != max ]; then
  by_memory=$(((memory / 1048576 - 5120) / 1536))
  [ "${by_memory}" -lt "${jobs}" ] && jobs="${by_memory}"
fi
[ "${jobs}" -ge 1 ] || jobs=1

slots="${RUNNER_TEMP:-/tmp}/compile-slots"
mkdir -p "${slots}"

echo "BUILD_CPUS=${cpus}"
echo "COMPILE_JOBS=${jobs}"
echo "COMPILE_SLOTS=${slots}"
echo "CMAKE_C_COMPILER_LAUNCHER=${PWD}/scripts/ci/compile-slot.sh"
echo "CMAKE_CXX_COMPILER_LAUNCHER=${PWD}/scripts/ci/compile-slot.sh"
