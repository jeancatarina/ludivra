#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f ".toolchains/emsdk/emsdk_env.sh" ]]; then
  echo "Emscripten ausente. Execute tools/deps/bootstrap-emsdk.sh." >&2
  exit 2
fi

export EMSDK_QUIET=1
source .toolchains/emsdk/emsdk_env.sh
emcmake cmake --preset wasm
cmake --build --preset wasm
cmake -E make_directory runtime-wasm/generated
cmake -E copy_if_different \
  build/wasm/runtime-wasm/ludivra-runtime.mjs \
  build/wasm/runtime-wasm/ludivra-runtime.wasm \
  runtime-wasm/generated
cmake -E remove_directory hosts/browser/public/runtime
