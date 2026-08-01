#include "network_session.hpp"

#include <algorithm>
#include <tuple>
#include <utility>

namespace ludivra::kernel {
namespace {

bool same_world(const NetworkWorldIdentity& left, const NetworkWorldIdentity& right) noexcept {
  return left.seed == right.seed && left.generator_id == right.generator_id &&
      left.generator_version == right.generator_version && left.content_hash == right.content_hash;
}

bool input_before(const std::pair<std::uint32_t, NetworkClientInput>& left,
    const std::pair<std::uint32_t, NetworkClientInput>& right) noexcept {
  return std::tie(left.second.client_sequence, left.first, left.second.action_id, left.second.value_milli) <
      std::tie(right.second.client_sequence, right.first, right.second.action_id, right.second.value_milli);
}

}  // namespace

LoopbackRoom::LoopbackRoom(NetworkRoomConfig config) : config_(std::move(config)), host_(config_.runtime) {}

Runtime& LoopbackRoom::host_runtime() noexcept { return host_; }

const Runtime& LoopbackRoom::host_runtime() const noexcept { return host_; }

bool LoopbackRoom::valid() const noexcept {
  return config_.runtime.tick_rate_hz > 0U && config_.runtime.max_pending_inputs > 0U &&
      config_.world.seed == config_.runtime.seed && !config_.world.generator_id.empty() &&
      config_.world.generator_id.size() <= 128U && config_.world.generator_version > 0U &&
      config_.protocol_version >= 2U && config_.maximum_clients > 0U && config_.maximum_inputs_per_client > 0U;
}

bool LoopbackRoom::compatible(const NetworkPeerHello& hello) const noexcept {
  return hello.protocol_version <= config_.protocol_version && hello.protocol_version + 1U >= config_.protocol_version &&
      same_world(hello.world, config_.world);
}

NetworkSnapshot LoopbackRoom::snapshot() const {
  return {host_.tick(), host_.state_hash(), host_.save()};
}

NetworkError LoopbackRoom::connect(const NetworkPeerHello& hello, std::uint32_t& client_id, NetworkSnapshot& initial) {
  if (!valid()) return NetworkError::configuration_invalid;
  if (hello.protocol_version != config_.protocol_version && hello.protocol_version + 1U != config_.protocol_version) {
    return NetworkError::protocol_version_unsupported;
  }
  if (!compatible(hello)) return NetworkError::world_identity_mismatch;
  if (clients_.size() >= config_.maximum_clients || next_client_id_ == 0U) return NetworkError::room_full;
  const auto id = next_client_id_++;
  clients_.emplace(id, Client{hello.protocol_version, true, 0U, {}});
  client_id = id;
  initial = snapshot();
  return NetworkError::none;
}

NetworkError LoopbackRoom::disconnect(const std::uint32_t client_id) {
  const auto found = clients_.find(client_id);
  if (found == clients_.end()) return NetworkError::client_unknown;
  found->second.connected = false;
  found->second.pending_inputs.clear();
  return NetworkError::none;
}

NetworkError LoopbackRoom::reconnect(
    const std::uint32_t client_id, const NetworkPeerHello& hello, NetworkSnapshot& restored) {
  const auto found = clients_.find(client_id);
  if (found == clients_.end()) return NetworkError::client_unknown;
  if (found->second.connected) return NetworkError::client_already_connected;
  if (hello.protocol_version != config_.protocol_version && hello.protocol_version + 1U != config_.protocol_version) {
    return NetworkError::protocol_version_unsupported;
  }
  if (!compatible(hello)) return NetworkError::world_identity_mismatch;
  found->second = {hello.protocol_version, true, found->second.reconnects + 1U, {}};
  restored = snapshot();
  return NetworkError::none;
}

NetworkError LoopbackRoom::submit_input(const std::uint32_t client_id, const NetworkClientInput input) {
  const auto found = clients_.find(client_id);
  if (found == clients_.end() || !found->second.connected) return NetworkError::client_unknown;
  if (found->second.pending_inputs.size() >= config_.maximum_inputs_per_client) return NetworkError::client_input_backlog;
  found->second.pending_inputs.push_back(input);
  return NetworkError::none;
}

NetworkError LoopbackRoom::submit_client_state(const std::uint32_t client_id, const std::span<const std::uint8_t> state) const {
  static_cast<void>(state);
  const auto found = clients_.find(client_id);
  return found == clients_.end() || !found->second.connected ? NetworkError::client_unknown : NetworkError::client_sent_state;
}

NetworkAdvance LoopbackRoom::advance() {
  if (!valid()) return {NetworkError::configuration_invalid, {}};
  std::vector<std::pair<std::uint32_t, NetworkClientInput>> inputs;
  for (const auto& [client_id, client] : clients_) {
    if (!client.connected) continue;
    for (const auto& input : client.pending_inputs) inputs.emplace_back(client_id, input);
  }
  std::sort(inputs.begin(), inputs.end(), input_before);
  for (const auto& [client_id, input] : inputs) {
    static_cast<void>(client_id);
    if (host_.submit_input({input.action_id, input.value_milli, next_host_sequence_++}) != RuntimeError::none) {
      return {NetworkError::runtime_failure, {}};
    }
  }
  if (host_.step(1U) != RuntimeError::none) return {NetworkError::runtime_failure, {}};
  for (auto& [client_id, client] : clients_) {
    static_cast<void>(client_id);
    client.pending_inputs.clear();
  }
  return {NetworkError::none, snapshot()};
}

NetworkError LoopbackRoom::apply_snapshot(Runtime& client, const NetworkSnapshot& remote) const {
  if (remote.archive.empty() || client.load_save(remote.archive) != RuntimeError::none ||
      client.tick() != remote.tick || client.state_hash() != remote.state_hash) {
    return NetworkError::snapshot_mismatch;
  }
  return NetworkError::none;
}

NetworkRoomInspection LoopbackRoom::inspect() const {
  NetworkRoomInspection inspection{host_.tick(), host_.state_hash(), {}};
  inspection.clients.reserve(clients_.size());
  for (const auto& [id, client] : clients_) {
    inspection.clients.push_back({id, client.protocol_version, client.connected,
        static_cast<std::uint32_t>(client.pending_inputs.size()), client.reconnects});
  }
  return inspection;
}

}  // namespace ludivra::kernel
