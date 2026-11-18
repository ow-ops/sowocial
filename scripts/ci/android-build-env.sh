#!/usr/bin/env bash
set -euo pipefail

# nproc shows the node, not the pod. A compile takes up to ~1.5 GiB, Gradle and Kotlin ~6 GiB.
cpus="$(nproc)"
if read -r quota period < /sys/fs/cgroup/cpu.max 2> /dev/null && [ "${quota}" != max ]; then
  cpus=$(((quota + period - 1) / period))
fi

jobs="${cpus}"
memory="$(cat /sys/fs/cgroup/memory.max 2> /dev/null || echo max)"
if [ "${memory}" != max ]; then
  by_memory=$(((memory / 1048576 - 6144) / 1536))
  [ "${by_memory}" -lt "${jobs}" ] && jobs="${by_memory}"
fi
[ "${jobs}" -ge 1 ] || jobs=1

mkdir -p "${RUNNER_TEMP:-/tmp}/compile-slots"

echo "BUILD_CPUS=${cpus}"
echo "COMPILE_JOBS=${jobs}"
echo "COMPILE_SLOTS=${RUNNER_TEMP:-/tmp}/compile-slots"
echo "CMAKE_C_COMPILER_LAUNCHER=${PWD}/scripts/ci/compile-slot.sh"
echo "CMAKE_CXX_COMPILER_LAUNCHER=${PWD}/scripts/ci/compile-slot.sh"

# expo-modules-core only writes its PCH checksum when it sees ccache, which the launcher hides.
echo "EXPO_FORCE_PCH_CCACHE_SUM=1"
echo "CCACHE_BASEDIR=${PWD}"
echo "CCACHE_NOHASHDIR=1"
echo "CCACHE_COMPILERCHECK=content"
echo "CCACHE_PCH_EXTSUM=1"
echo "CCACHE_SLOPPINESS=pch_defines,time_macros"
