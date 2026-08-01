#include "ludivra/runtime.h"

#include "runtime.hpp"

#include <algorithm>
#include <cstddef>
#include <cstring>
#include <limits>
#include <new>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

struct ludivra_runtime final {
  explicit ludivra_runtime(const ludivra::kernel::RuntimeConfig config) : value(config) {}

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
    case ludivra::kernel::RuntimeError::archive_invalid:
      return LUDIVRA_ERROR_ARCHIVE_INVALID;
    case ludivra::kernel::RuntimeError::replay_mismatch:
      return LUDIVRA_ERROR_REPLAY_MISMATCH;
    case ludivra::kernel::RuntimeError::pending_inputs:
      return LUDIVRA_ERROR_PENDING_INPUTS;
    case ludivra::kernel::RuntimeError::presentation_limit:
      return LUDIVRA_ERROR_PRESENTATION_LIMIT;
    case ludivra::kernel::RuntimeError::symbol_conflict:
      return LUDIVRA_ERROR_SYMBOL_CONFLICT;
    case ludivra::kernel::RuntimeError::content_pack_invalid:
      return LUDIVRA_ERROR_CONTENT_PACK_INVALID;
    case ludivra::kernel::RuntimeError::statechart_invalid:
      return LUDIVRA_ERROR_STATECHART_INVALID;
    case ludivra::kernel::RuntimeError::statechart_event_unhandled:
      return LUDIVRA_ERROR_STATECHART_EVENT_UNHANDLED;
    case ludivra::kernel::RuntimeError::region_storage_unconfigured:
      return LUDIVRA_ERROR_REGION_STORAGE_UNCONFIGURED;
    case ludivra::kernel::RuntimeError::region_storage_failure:
      return LUDIVRA_ERROR_REGION_STORAGE_FAILURE;
    case ludivra::kernel::RuntimeError::region_identity_mismatch:
      return LUDIVRA_ERROR_REGION_IDENTITY_MISMATCH;
  }
  return LUDIVRA_ERROR_INTERNAL;
}

uint32_t to_public_event_type(const ludivra::kernel::PresentationEventKind kind) noexcept {
  switch (kind) {
    case ludivra::kernel::PresentationEventKind::audio_play:
      return LUDIVRA_PRESENTATION_AUDIO_PLAY;
    case ludivra::kernel::PresentationEventKind::audio_stop:
      return LUDIVRA_PRESENTATION_AUDIO_STOP;
    case ludivra::kernel::PresentationEventKind::effect_spawn:
      return LUDIVRA_PRESENTATION_EFFECT_SPAWN;
  }
  return 0U;
}

static_assert(sizeof(ludivra_presentation_event) == LUDIVRA_PRESENTATION_EVENT_RECORD_SIZE);
static_assert(std::is_standard_layout_v<ludivra_presentation_event>);
static_assert(sizeof(ludivra_statechart_trace) == LUDIVRA_STATECHART_TRACE_RECORD_SIZE);
static_assert(std::is_standard_layout_v<ludivra_statechart_trace>);

template <typename Producer>
ludivra_result archive_size(const ludivra_runtime* runtime, uint32_t* out_size, Producer producer) {
  if (runtime == nullptr || out_size == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    const auto archive = producer(runtime->value);
    if (archive.size() > std::numeric_limits<uint32_t>::max()) {
      return LUDIVRA_ERROR_INTERNAL;
    }
    *out_size = static_cast<uint32_t>(archive.size());
    return LUDIVRA_OK;
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

template <typename Producer>
ludivra_result archive_write(
    const ludivra_runtime* runtime,
    uint8_t* buffer,
    const uint32_t buffer_size,
    Producer producer) {
  if (runtime == nullptr || buffer == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    const auto archive = producer(runtime->value);
    if (archive.size() > buffer_size) {
      return LUDIVRA_ERROR_BUFFER_TOO_SMALL;
    }
    std::memcpy(buffer, archive.data(), archive.size());
    return LUDIVRA_OK;
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
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
    case LUDIVRA_ERROR_ARCHIVE_INVALID:
      return "invalid or corrupt archive";
    case LUDIVRA_ERROR_REPLAY_MISMATCH:
      return "replay result mismatch";
    case LUDIVRA_ERROR_PENDING_INPUTS:
      return "operation rejected while inputs are pending";
    case LUDIVRA_ERROR_BUFFER_TOO_SMALL:
      return "output buffer too small";
    case LUDIVRA_ERROR_PRESENTATION_LIMIT:
      return "presentation event limit reached; drain events before stepping again";
    case LUDIVRA_ERROR_SYMBOL_CONFLICT:
      return "state symbol already declared with a different key";
    case LUDIVRA_ERROR_CONTENT_PACK_INVALID:
      return "content pack is invalid or uses an unsupported format";
    case LUDIVRA_ERROR_STATECHART_INVALID:
      return "statechart definition or snapshot is invalid";
    case LUDIVRA_ERROR_STATECHART_EVENT_UNHANDLED:
      return "statechart event has no transition";
    case LUDIVRA_ERROR_REGION_STORAGE_UNCONFIGURED:
      return "region storage is not configured for this runtime";
    case LUDIVRA_ERROR_REGION_STORAGE_FAILURE:
      return "region storage operation failed";
    case LUDIVRA_ERROR_REGION_IDENTITY_MISMATCH:
      return "stored region generator identity does not match this runtime";
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

ludivra_result ludivra_runtime_install_statechart(
    ludivra_runtime* runtime,
    const ludivra_statechart_state* states,
    const uint32_t state_count,
    const ludivra_statechart_transition* transitions,
    const uint32_t transition_count,
    const ludivra_statechart_action* actions,
    const uint32_t action_count,
    const uint32_t initial_state) {
  if (runtime == nullptr || states == nullptr || state_count == 0U ||
      (transition_count > 0U && transitions == nullptr) || (action_count > 0U && actions == nullptr)) return LUDIVRA_ERROR_INVALID_ARGUMENT;
  try {
    std::vector<ludivra::kernel::StatechartState> native_states;
    std::vector<ludivra::kernel::StatechartTransition> native_transitions;
    native_states.reserve(state_count); native_transitions.reserve(transition_count);
    for (uint32_t index = 0; index < state_count; ++index) native_states.push_back({states[index].id, states[index].has_parent == 0U ? std::nullopt : std::optional{states[index].parent_id}, states[index].shallow_history != 0U, {}, {}});
    for (uint32_t index = 0; index < transition_count; ++index) {
      if (transitions[index].kind > 1U) return LUDIVRA_ERROR_INVALID_ARGUMENT;
      native_transitions.push_back({
          transitions[index].id,
          transitions[index].from_state,
          transitions[index].event_action_id == 0U ? std::nullopt : std::optional{transitions[index].event_action_id},
          transitions[index].after_ticks == 0U ? std::nullopt : std::optional{static_cast<std::uint64_t>(transitions[index].after_ticks)},
          transitions[index].to_state,
          transitions[index].priority,
          transitions[index].kind == 0U ? ludivra::kernel::StatechartTransitionKind::external : ludivra::kernel::StatechartTransitionKind::internal,
          transitions[index].guard_id == 0U ? std::nullopt : std::optional{transitions[index].guard_id},
          {}});
    }
    for (uint32_t index = 0; index < action_count; ++index) {
      const auto& action = actions[index];
      if (action.action_id == 0U) return LUDIVRA_ERROR_INVALID_ARGUMENT;
      if (action.phase == LUDIVRA_STATECHART_ACTION_ENTRY || action.phase == LUDIVRA_STATECHART_ACTION_EXIT) {
        const auto state = std::find_if(native_states.begin(), native_states.end(), [&action](const auto& value) { return value.id == action.owner_id; });
        if (state == native_states.end()) return LUDIVRA_ERROR_INVALID_ARGUMENT;
        (action.phase == LUDIVRA_STATECHART_ACTION_ENTRY ? state->entry_actions : state->exit_actions).push_back(action.action_id);
      } else if (action.phase == LUDIVRA_STATECHART_ACTION_TRANSITION) {
        const auto transition = std::find_if(native_transitions.begin(), native_transitions.end(), [&action](const auto& value) { return value.id == action.owner_id; });
        if (transition == native_transitions.end()) return LUDIVRA_ERROR_INVALID_ARGUMENT;
        transition->actions.push_back(action.action_id);
      } else {
        return LUDIVRA_ERROR_INVALID_ARGUMENT;
      }
    }
    return to_public_result(runtime->value.install_statechart(std::move(native_states), std::move(native_transitions), initial_state));
  } catch (const std::bad_alloc&) { return LUDIVRA_ERROR_ALLOCATION; }
  catch (...) { return LUDIVRA_ERROR_INTERNAL; }
}

ludivra_result ludivra_runtime_declare_statechart_handler(
    ludivra_runtime* runtime,
    const ludivra_statechart_handler_kind kind,
    const char* name,
    const uint32_t name_size,
    const uint32_t id) {
  if (runtime == nullptr || name == nullptr || name_size == 0U || name_size > 128U || id == 0U ||
      (kind != LUDIVRA_STATECHART_HANDLER_GUARD && kind != LUDIVRA_STATECHART_HANDLER_ACTION)) return LUDIVRA_ERROR_INVALID_ARGUMENT;
  try {
    return to_public_result(runtime->value.declare_statechart_handler(
        kind == LUDIVRA_STATECHART_HANDLER_GUARD ? ludivra::kernel::StatechartHandlerKind::guard : ludivra::kernel::StatechartHandlerKind::action,
        {name, name_size}, id));
  } catch (const std::bad_alloc&) { return LUDIVRA_ERROR_ALLOCATION; }
  catch (...) { return LUDIVRA_ERROR_INTERNAL; }
}

ludivra_result ludivra_runtime_statechart_active(const ludivra_runtime* runtime, uint32_t* out_state) {
  if (runtime == nullptr || out_state == nullptr) return LUDIVRA_ERROR_INVALID_ARGUMENT;
  *out_state = runtime->value.statechart_active();
  return LUDIVRA_OK;
}

ludivra_result ludivra_runtime_statechart_trace_count(const ludivra_runtime* runtime, uint32_t* out_count) {
  if (runtime == nullptr || out_count == nullptr) return LUDIVRA_ERROR_INVALID_ARGUMENT;
  const auto& traces = runtime->value.statechart_traces();
  if (traces.size() > std::numeric_limits<uint32_t>::max()) return LUDIVRA_ERROR_INTERNAL;
  *out_count = static_cast<uint32_t>(traces.size());
  return LUDIVRA_OK;
}

ludivra_result ludivra_runtime_statechart_traces_write(
    const ludivra_runtime* runtime,
    ludivra_statechart_trace* buffer,
    const uint32_t capacity,
    uint32_t* out_count) {
  if (runtime == nullptr || out_count == nullptr || (capacity > 0U && buffer == nullptr)) return LUDIVRA_ERROR_INVALID_ARGUMENT;
  const auto& traces = runtime->value.statechart_traces();
  if (traces.size() > capacity) return LUDIVRA_ERROR_BUFFER_TOO_SMALL;
  for (std::size_t index = 0; index < traces.size(); ++index) {
    const auto& trace = traces[index];
    buffer[index] = {
        trace.tick, trace.event, trace.transition, trace.guard, trace.action,
        trace.previous, trace.active, static_cast<uint8_t>(trace.kind),
        static_cast<uint8_t>(trace.guard_passed ? 1U : 0U),
        trace.action_phase.has_value() ? static_cast<uint8_t>(*trace.action_phase) : static_cast<uint8_t>(255U),
        static_cast<uint8_t>(trace.error)};
  }
  *out_count = static_cast<uint32_t>(traces.size());
  return LUDIVRA_OK;
}

ludivra_result ludivra_runtime_statechart_traces_clear(ludivra_runtime* runtime) {
  if (runtime == nullptr) return LUDIVRA_ERROR_INVALID_ARGUMENT;
  runtime->value.clear_statechart_traces();
  return LUDIVRA_OK;
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

ludivra_result ludivra_runtime_load_content_pack(
    ludivra_runtime* runtime,
    const char* bytes,
    const uint32_t size) {
  if (runtime == nullptr || bytes == nullptr || size == 0U) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public_result(runtime->value.load_content_pack({bytes, size}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

ludivra_result ludivra_runtime_configure_region_storage(
    ludivra_runtime* runtime,
    const ludivra_runtime_region_storage_config* config) {
  if (runtime == nullptr || config == nullptr || config->struct_size != sizeof(ludivra_runtime_region_storage_config) ||
      config->root_utf8 == nullptr || config->root_utf8_bytes == 0U || config->maximum_region_bytes < 128U ||
      config->generator_id_utf8 == nullptr || config->generator_id_utf8_bytes == 0U ||
      config->generator_id_utf8_bytes > 128U || config->generator_version == 0U) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    ludivra::kernel::RuntimeRegionStorageConfig native{
        {std::string(config->root_utf8, config->root_utf8_bytes), config->maximum_region_bytes},
        std::string(config->generator_id_utf8, config->generator_id_utf8_bytes), config->generator_version};
    return to_public_result(runtime->value.configure_region_storage(std::move(native)));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
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

ludivra_result ludivra_runtime_declare_symbol(
    ludivra_runtime* runtime,
    const ludivra_symbol_kind kind,
    const char* name,
    const uint32_t name_size,
    const uint32_t key) {
  if (runtime == nullptr || name == nullptr || name_size == 0U || name_size > 128U ||
      (kind != LUDIVRA_SYMBOL_STATE && kind != LUDIVRA_SYMBOL_TIMER)) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    const auto symbol_kind = kind == LUDIVRA_SYMBOL_STATE
        ? ludivra::kernel::SymbolKind::state
        : ludivra::kernel::SymbolKind::timer;
    return to_public_result(runtime->value.declare_symbol(symbol_kind, {name, name_size}, key));
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

ludivra_result ludivra_runtime_save_size(
    const ludivra_runtime* runtime,
    uint32_t* out_size) {
  return archive_size(runtime, out_size, [](const auto& value) { return value.save(); });
}

ludivra_result ludivra_runtime_save_write(
    const ludivra_runtime* runtime,
    uint8_t* buffer,
    const uint32_t buffer_size) {
  return archive_write(runtime, buffer, buffer_size, [](const auto& value) { return value.save(); });
}

ludivra_result ludivra_runtime_load_save(
    ludivra_runtime* runtime,
    const uint8_t* buffer,
    const uint32_t buffer_size) {
  if (runtime == nullptr || buffer == nullptr || buffer_size == 0U) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public_result(runtime->value.load_save({buffer, buffer_size}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

ludivra_result ludivra_runtime_replay_size(
    const ludivra_runtime* runtime,
    uint32_t* out_size) {
  return archive_size(runtime, out_size, [](const auto& value) { return value.replay(); });
}

ludivra_result ludivra_runtime_replay_write(
    const ludivra_runtime* runtime,
    uint8_t* buffer,
    const uint32_t buffer_size) {
  return archive_write(runtime, buffer, buffer_size, [](const auto& value) { return value.replay(); });
}

ludivra_result ludivra_runtime_verify_replay(
    const ludivra_runtime* runtime,
    const uint8_t* buffer,
    const uint32_t buffer_size) {
  if (runtime == nullptr || buffer == nullptr || buffer_size == 0U) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public_result(runtime->value.verify_replay({buffer, buffer_size}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_ERROR_INTERNAL;
  }
}

ludivra_result ludivra_runtime_presentation_event_count(
    const ludivra_runtime* runtime,
    uint32_t* out_count) {
  if (runtime == nullptr || out_count == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  const auto size = runtime->value.presentation_events().size();
  if (size > LUDIVRA_MAX_BUFFERED_PRESENTATION_EVENTS) {
    return LUDIVRA_ERROR_INTERNAL;
  }
  *out_count = static_cast<uint32_t>(size);
  return LUDIVRA_OK;
}

ludivra_result ludivra_runtime_presentation_events_write(
    const ludivra_runtime* runtime,
    ludivra_presentation_event* buffer,
    const uint32_t capacity,
    uint32_t* out_count) {
  if (runtime == nullptr || out_count == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  const auto& events = runtime->value.presentation_events();
  if (events.size() > capacity) {
    *out_count = static_cast<uint32_t>(events.size());
    return LUDIVRA_ERROR_BUFFER_TOO_SMALL;
  }
  if (!events.empty() && buffer == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  for (std::size_t index = 0; index < events.size(); ++index) {
    const auto& source = events[index];
    buffer[index] = {sizeof(ludivra_presentation_event), to_public_event_type(source.kind),
        source.id, source.value_milli, source.x_milli, source.y_milli, source.z_milli,
        0U, source.sequence};
  }
  *out_count = static_cast<uint32_t>(events.size());
  return LUDIVRA_OK;
}

ludivra_result ludivra_runtime_presentation_events_clear(ludivra_runtime* runtime) {
  if (runtime == nullptr) {
    return LUDIVRA_ERROR_INVALID_ARGUMENT;
  }
  runtime->value.clear_presentation_events();
  return LUDIVRA_OK;
}

const char* ludivra_runtime_last_error(const ludivra_runtime* runtime) {
  return runtime == nullptr ? "invalid runtime" : runtime->value.last_error().c_str();
}

const char* ludivra_runtime_last_error_code(const ludivra_runtime* runtime) {
  return runtime == nullptr ? "" : runtime->value.last_error_code().c_str();
}
