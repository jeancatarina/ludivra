#!/usr/bin/env bash
set -euo pipefail

readonly EMSDK_VERSION="6.0.3"
readonly REPOSITORY="https://github.com/emscripten-core/emsdk.git"
readonly TOOLCHAIN_DIR=".toolchains/emsdk"

if [[ ! -d "${TOOLCHAIN_DIR}/.git" ]]; then
  git clone --filter=blob:none "${REPOSITORY}" "${TOOLCHAIN_DIR}"
fi

git -C "${TOOLCHAIN_DIR}" fetch --tags --force
git -C "${TOOLCHAIN_DIR}" checkout --detach "${EMSDK_VERSION}"
"${TOOLCHAIN_DIR}/emsdk" install "${EMSDK_VERSION}"
"${TOOLCHAIN_DIR}/emsdk" activate "${EMSDK_VERSION}"
