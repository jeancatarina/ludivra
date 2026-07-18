#include "ludivra/runtime.h"

#include <cinttypes>
#include <cstdio>

namespace {

constexpr uint64_t expected_state_hash = 0x81478b41055d6de6ULL;

struct TestContext final {
  void expect(const bool condition, const char* message) {
    if (!condition) {
      std::fprintf(stderr, "FAIL: %s\n", message);
      ++failures;
    }
  }

  int failures{0};
};

ludivra_runtime* create_runtime(TestContext& context, const uint32_t max_pending_inputs = 4096U) {
  const ludivra_runtime_config config{
      sizeof(ludivra_runtime_config), 60U, max_pending_inputs, 42U};
  ludivra_runtime* runtime = nullptr;
  context.expect(ludivra_runtime_create(&config, &runtime) == LUDIVRA_OK, "runtime creation succeeds");
  return runtime;
}

void submit(
    TestContext& context,
    ludivra_runtime* runtime,
    const uint32_t action,
    const int32_t value,
    const uint64_t sequence) {
  const ludivra_logical_input input{sizeof(ludivra_logical_input), action, value, sequence};
  context.expect(
      ludivra_runtime_submit_input(runtime, &input) == LUDIVRA_OK,
      "input submission succeeds");
}

uint64_t state_hash(TestContext& context, ludivra_runtime* runtime) {
  uint64_t value = 0;
  context.expect(
      ludivra_runtime_state_hash(runtime, &value) == LUDIVRA_OK,
      "state hash inspection succeeds");
  return value;
}

}  // namespace

int main() {
  TestContext context;
  context.expect(ludivra_runtime_abi_version() == 1U, "ABI version is stable");
  context.expect(
      ludivra_runtime_create(nullptr, nullptr) == LUDIVRA_ERROR_INVALID_ARGUMENT,
      "invalid creation arguments are rejected");
  const ludivra_runtime_config invalid_config{sizeof(ludivra_runtime_config), 60U, 0U, 42U};
  ludivra_runtime* invalid_runtime = nullptr;
  context.expect(
      ludivra_runtime_create(&invalid_config, &invalid_runtime) == LUDIVRA_ERROR_INVALID_ARGUMENT,
      "zero input limit is rejected");
  context.expect(invalid_runtime == nullptr, "failed creation clears the output handle");

  auto* first = create_runtime(context);
  auto* second = create_runtime(context);
  submit(context, first, 2U, -500, 20U);
  submit(context, first, 1U, 1000, 10U);
  submit(context, second, 1U, 1000, 10U);
  submit(context, second, 2U, -500, 20U);

  context.expect(ludivra_runtime_step(first, 2U) == LUDIVRA_OK, "first runtime advances");
  context.expect(ludivra_runtime_step(second, 2U) == LUDIVRA_OK, "second runtime advances");

  uint64_t tick = 0;
  context.expect(ludivra_runtime_tick(first, &tick) == LUDIVRA_OK, "tick inspection succeeds");
  context.expect(tick == 2U, "tick count is exact");
  context.expect(
      state_hash(context, first) == state_hash(context, second),
      "input arrival order does not change state hash");
  context.expect(
      state_hash(context, first) == expected_state_hash,
      "state hash matches the golden vector");

  auto* limited = create_runtime(context, 1U);
  submit(context, limited, 1U, 1000, 1U);
  const ludivra_logical_input excess_input{sizeof(ludivra_logical_input), 2U, 1000, 2U};
  context.expect(
      ludivra_runtime_submit_input(limited, &excess_input) == LUDIVRA_ERROR_INPUT_LIMIT,
      "pending input limit is enforced");

  std::printf("state_hash=%016" PRIx64 "\n", state_hash(context, first));
  ludivra_runtime_destroy(first);
  ludivra_runtime_destroy(second);
  ludivra_runtime_destroy(limited);
  return context.failures == 0 ? 0 : 1;
}
