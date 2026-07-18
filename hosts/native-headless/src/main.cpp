#include "ludivra/runtime.h"

#include <cinttypes>
#include <cstdio>

namespace {

int fail(const ludivra_result result) {
  std::fprintf(stderr, "runtime error: %s\n", ludivra_result_message(result));
  return static_cast<int>(result);
}

}  // namespace

int main() {
  const ludivra_runtime_config config{sizeof(ludivra_runtime_config), 60U, 4096U, 42U};
  ludivra_runtime* runtime = nullptr;
  if (const auto result = ludivra_runtime_create(&config, &runtime); result != LUDIVRA_OK) {
    return fail(result);
  }

  const ludivra_logical_input input{sizeof(ludivra_logical_input), 1U, 1000, 1U};
  if (const auto result = ludivra_runtime_submit_input(runtime, &input); result != LUDIVRA_OK) {
    ludivra_runtime_destroy(runtime);
    return fail(result);
  }
  if (const auto result = ludivra_runtime_step(runtime, 2U); result != LUDIVRA_OK) {
    ludivra_runtime_destroy(runtime);
    return fail(result);
  }

  uint64_t tick = 0;
  uint64_t state_hash = 0;
  const auto tick_result = ludivra_runtime_tick(runtime, &tick);
  const auto hash_result = ludivra_runtime_state_hash(runtime, &state_hash);
  if (tick_result != LUDIVRA_OK || hash_result != LUDIVRA_OK) {
    ludivra_runtime_destroy(runtime);
    return fail(tick_result != LUDIVRA_OK ? tick_result : hash_result);
  }

  std::printf(
      "{\"abiVersion\":%u,\"tick\":%" PRIu64 ",\"stateHash\":\"%016" PRIx64 "\"}\n",
      ludivra_runtime_abi_version(),
      tick,
      state_hash);
  ludivra_runtime_destroy(runtime);
  return 0;
}
