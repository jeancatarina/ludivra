#include "ludivra/network.h"

#include "network_session.hpp"
#include "runtime_handle.hpp"

#include <cstring>
#include <limits>
#include <new>
#include <string>
#include <utility>

struct ludivra_network_room final {
  ludivra_network_room(ludivra::kernel::NetworkRoomConfig config, ludivra::kernel::Runtime& host)
      : value(std::move(config), host) {}

  ludivra::kernel::LoopbackRoom value;
};

namespace {

ludivra_network_result to_public(const ludivra::kernel::NetworkError error) noexcept {
  using ludivra::kernel::NetworkError;
  switch (error) {
    case NetworkError::none: return LUDIVRA_NETWORK_OK;
    case NetworkError::configuration_invalid: return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
    case NetworkError::protocol_version_unsupported: return LUDIVRA_NETWORK_ERROR_PROTOCOL_VERSION_UNSUPPORTED;
    case NetworkError::world_identity_mismatch: return LUDIVRA_NETWORK_ERROR_WORLD_IDENTITY_MISMATCH;
    case NetworkError::room_full: return LUDIVRA_NETWORK_ERROR_ROOM_FULL;
    case NetworkError::client_unknown:
    case NetworkError::client_already_connected: return LUDIVRA_NETWORK_ERROR_CLIENT_UNKNOWN;
    case NetworkError::client_input_backlog: return LUDIVRA_NETWORK_ERROR_CLIENT_INPUT_BACKLOG;
    case NetworkError::client_sent_state: return LUDIVRA_NETWORK_ERROR_CLIENT_SENT_STATE;
    case NetworkError::runtime_failure: return LUDIVRA_NETWORK_ERROR_RUNTIME;
    case NetworkError::snapshot_mismatch: return LUDIVRA_NETWORK_ERROR_SNAPSHOT_MISMATCH;
    case NetworkError::migration_pending_inputs:
    case NetworkError::host_migration_failed: return LUDIVRA_NETWORK_ERROR_INTERNAL;
  }
  return LUDIVRA_NETWORK_ERROR_INTERNAL;
}

bool valid_text(const char* text, const uint32_t size) noexcept {
  return text != nullptr && size > 0U && size <= 128U;
}

ludivra::kernel::NetworkWorldIdentity identity(
    const uint64_t seed, const char* generator, const uint32_t generator_size,
    const uint32_t generator_version, const uint64_t content_hash) {
  return {seed, std::string(generator, generator_size), generator_version, content_hash};
}

}  // namespace

uint32_t ludivra_network_abi_version(void) { return LUDIVRA_NETWORK_ABI_VERSION; }

const char* ludivra_network_result_message(const ludivra_network_result result) {
  switch (result) {
    case LUDIVRA_NETWORK_OK: return "ok";
    case LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT: return "invalid network-room argument";
    case LUDIVRA_NETWORK_ERROR_ALLOCATION: return "network-room allocation failure";
    case LUDIVRA_NETWORK_ERROR_PROTOCOL_VERSION_UNSUPPORTED: return "network protocol version is unsupported";
    case LUDIVRA_NETWORK_ERROR_WORLD_IDENTITY_MISMATCH: return "network world identity does not match";
    case LUDIVRA_NETWORK_ERROR_ROOM_FULL: return "network room is full";
    case LUDIVRA_NETWORK_ERROR_CLIENT_UNKNOWN: return "network client is unknown";
    case LUDIVRA_NETWORK_ERROR_CLIENT_INPUT_BACKLOG: return "network client input backlog exceeded";
    case LUDIVRA_NETWORK_ERROR_CLIENT_SENT_STATE: return "network client cannot send authoritative state";
    case LUDIVRA_NETWORK_ERROR_RUNTIME: return "network host runtime failed";
    case LUDIVRA_NETWORK_ERROR_SNAPSHOT_MISMATCH: return "network snapshot does not match";
    case LUDIVRA_NETWORK_ERROR_INTERNAL: return "network internal failure";
  }
  return "unknown network result";
}

ludivra_network_result ludivra_network_room_create(
    ludivra_runtime* host_runtime,
    const ludivra_network_room_config* config,
    ludivra_network_room** out_room) {
  if (out_room == nullptr) return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  *out_room = nullptr;
  if (host_runtime == nullptr || config == nullptr || config->struct_size != sizeof(ludivra_network_room_config) ||
      config->tick_rate_hz == 0U || config->max_pending_inputs == 0U || config->protocol_version < 2U ||
      config->maximum_clients == 0U || config->maximum_inputs_per_client == 0U ||
      !valid_text(config->generator_id_utf8, config->generator_id_utf8_bytes) || config->generator_version == 0U) {
    return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  }
  try {
    ludivra::kernel::NetworkRoomConfig native{{config->tick_rate_hz, config->max_pending_inputs, config->seed},
        identity(config->seed, config->generator_id_utf8, config->generator_id_utf8_bytes,
            config->generator_version, config->content_hash), config->protocol_version,
        config->maximum_clients, config->maximum_inputs_per_client};
    *out_room = new ludivra_network_room(std::move(native), host_runtime->value);
    return LUDIVRA_NETWORK_OK;
  } catch (const std::bad_alloc&) {
    return LUDIVRA_NETWORK_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_NETWORK_ERROR_INTERNAL;
  }
}

void ludivra_network_room_destroy(ludivra_network_room* room) { delete room; }

ludivra_network_result ludivra_network_room_connect(
    ludivra_network_room* room,
    const ludivra_network_peer_hello* hello,
    uint32_t* out_client_id) {
  if (room == nullptr || hello == nullptr || out_client_id == nullptr || hello->struct_size != sizeof(ludivra_network_peer_hello) ||
      !valid_text(hello->generator_id_utf8, hello->generator_id_utf8_bytes) || hello->generator_version == 0U) {
    return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  }
  try {
    ludivra::kernel::NetworkSnapshot ignored{};
    return to_public(room->value.connect({hello->protocol_version,
        identity(hello->seed, hello->generator_id_utf8, hello->generator_id_utf8_bytes,
            hello->generator_version, hello->content_hash)}, *out_client_id, ignored));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_NETWORK_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_NETWORK_ERROR_INTERNAL;
  }
}

ludivra_network_result ludivra_network_room_submit_input(
    ludivra_network_room* room,
    const uint32_t client_id,
    const ludivra_network_input* input) {
  if (room == nullptr || input == nullptr || input->struct_size != sizeof(ludivra_network_input)) {
    return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public(room->value.submit_input(client_id, {input->action_id, input->value_milli, input->sequence}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_NETWORK_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_NETWORK_ERROR_INTERNAL;
  }
}

ludivra_network_result ludivra_network_room_reject_client_state(
    const ludivra_network_room* room,
    const uint32_t client_id) {
  if (room == nullptr) return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  return to_public(room->value.submit_client_state(client_id, {}));
}

ludivra_network_result ludivra_network_room_advance(ludivra_network_room* room) {
  if (room == nullptr) return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  try {
    return to_public(room->value.advance().error);
  } catch (const std::bad_alloc&) {
    return LUDIVRA_NETWORK_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_NETWORK_ERROR_INTERNAL;
  }
}

ludivra_network_result ludivra_network_room_snapshot_size(
    const ludivra_network_room* room,
    uint32_t* out_size) {
  if (room == nullptr || out_size == nullptr) return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  try {
    const auto snapshot = room->value.current_snapshot();
    if (snapshot.archive.size() > std::numeric_limits<uint32_t>::max()) return LUDIVRA_NETWORK_ERROR_INTERNAL;
    *out_size = static_cast<uint32_t>(snapshot.archive.size());
    return LUDIVRA_NETWORK_OK;
  } catch (...) {
    return LUDIVRA_NETWORK_ERROR_INTERNAL;
  }
}

ludivra_network_result ludivra_network_room_snapshot_write(
    const ludivra_network_room* room,
    uint8_t* buffer,
    const uint32_t buffer_size,
    uint64_t* out_tick,
    uint64_t* out_state_hash) {
  if (room == nullptr || buffer == nullptr || out_tick == nullptr || out_state_hash == nullptr) {
    return LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT;
  }
  try {
    const auto snapshot = room->value.current_snapshot();
    if (snapshot.archive.size() > buffer_size) return LUDIVRA_NETWORK_ERROR_SNAPSHOT_MISMATCH;
    std::memcpy(buffer, snapshot.archive.data(), snapshot.archive.size());
    *out_tick = snapshot.tick;
    *out_state_hash = snapshot.state_hash;
    return LUDIVRA_NETWORK_OK;
  } catch (...) {
    return LUDIVRA_NETWORK_ERROR_INTERNAL;
  }
}
