#include "ludivra/runtime.h"

#include "runtime.hpp"

#include <cstddef>
#include <new>

struct ludivra_runtime final {
  explicit ludivra_runtime(const ludivra::kernel::RuntimeConfig config) noexcept : value(config) {}

  ludivra::kernel::Runtime value;
};

namespace {

ludivra_result to_public_result(const ludivra::kernel::RuntimeError error) noexcept {
  switch (error) {
    case ludivra::kernel::RuntimeError::none:
      return LUDIVRA_OK;
    case ludivra::kernel::RuntimeError::tick_overflow:
      return LUDIVRA_ERROR_TICK_OVERFLOW;
    case ludivra::kernel::RuntimeError::input_limit:
      return LUDIVRA_ERROR_INPUT_LIMIT;
    case ludivra::kernel::RuntimeError::script_failure:
      return LUDIVRA_ERROR_SCRIPT;
    case ludivra::kernel::RuntimeError::integer_overflow:
      return LUDIVRA_ERROR_INTEGER_OVERFLOW;
  }
  return LUDIVRA_ERROR_INTERNAL;
}

}  // namespace

uint32_t ludivra_runtime_abi_version(void) {
  return LUDIVRA_RUNTIME_ABI_VERSION;
}

const char* ludivra_result_message(const ludivra_result result) {
  switch (result) {
    case LUDIVRA_OK:
      return "ok";
    case LUDIVRA_ERROR_INVALID_ARGUMENT:
      return "invalid argument";
    case LUDIVRA_ERROR_ALLOCATION:
      return "allocation failure";
    case LUDIVRA_ERROR_TICK_OVERFLOW:
      return "tick overflow";
    case LUDIVRA_ERROR_INPUT_LIMIT:
      return "pending input limit reached";
    case LUDIVRA_ERROR_INTERNAL:
      return "internal error";
    case LUDIVRA_ERROR_SCRIPT:
      return "gameplay script failure";
    case LUDIVRA_ERROR_INTEGER_OVERFLOW:
      return "integer state overflow";
  }
  return "unknown result";
}

ludivra_result ludivra_runtime_create(
    const ludivra_runtime_config* config,
    ludivra_runtime** out_runtime) {
  if (out_runtime == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  *out_runtime = nullptr;
  if (config == nullptr || config->struct_size != sizeof(ludivra_runtime_config) ||
      config->tick_rate_hz == 0U || config->max_pending_inputs == 0U) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }

  try {
    *out_runtime = new ludivra_runtime(
        {config->tick_rate_hz, config->max_pending_inputs, config->seed});
    return LUDIVRA_OK;
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

void ludivra_runtime_destroy(ludivra_runtime* runtime) {
  delete runtime;
}

ludivra_result ludivra_runtime_submit_input(
    ludivra_runtime* runtime,
    const ludivra_logical_input* input) {
  if (runtime == nullptr || input == nullptr || input->struct_size != sizeof(ludivra_logical_input)) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }

  try {
    return to_public_result(
        runtime->value.submit_input({input->action_id, input->value_milli, input->sequence}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

ludivra_result ludivra_runtime_step(ludivra_runtime* runtime, const uint32_t tick_count) {
  if (runtime == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public_result(runtime->value.step(tick_count));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

ludivra_result ludivra_runtime_tick(const ludivra_runtime* runtime, uint64_t* out_tick) {
  if (runtime == nullptr || out_tick == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  *out_tick = runtime->value.tick();
  return LUDIVRA_OK;
}

ludivra_result ludivra_runtime_state_hash(
    const ludivra_runtime* runtime,
    uint64_t* out_state_hash) {
  if (runtime == nullptr || out_state_hash == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  *out_state_hash = runtime->value.state_hash();
  return LUDIVRA_OK;
}

ludivra_result ludivra_runtime_load_gameplay(
    ludivra_runtime* runtime,
    const char* source,
    const uint32_t source_size) {
  if (runtime == nullptr || source == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public_result(runtime->value.load_gameplay({source, source_size}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

ludivra_result ludivra_runtime_integer_state(
    const ludivra_runtime* runtime,
    const uint32_t key,
    int64_t* out_value) {
  if (runtime == nullptr || out_value == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  *out_value = runtime->value.integer_state(key);
  return LUDIVRA_OK;
}

const char* ludivra_runtime_last_error(const ludivra_runtime* runtime) {
  return runtime == nullptr ? "invalid runtime" : runtime->value.last_error().c_str();
}
