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

bool same_config(const NetworkRoomConfig& left, const NetworkRoomConfig& right) noexcept {
  return left.runtime.tick_rate_hz == right.runtime.tick_rate_hz &&
      left.runtime.max_pending_inputs == right.runtime.max_pending_inputs && left.runtime.seed == right.runtime.seed &&
      same_world(left.world, right.world) && left.protocol_version == right.protocol_version &&
      left.maximum_clients == right.maximum_clients && left.maximum_inputs_per_client == right.maximum_inputs_per_client;
}

bool input_before(const std::pair<std::uint32_t, NetworkClientInput>& left,
    const std::pair<std::uint32_t, NetworkClientInput>& right) noexcept {
  return std::tie(left.second.client_sequence, left.first, left.second.action_id, left.second.value_milli) <
      std::tie(right.second.client_sequence, right.first, right.second.action_id, right.second.value_milli);
}

}  // namespace

LoopbackRoom::LoopbackRoom(NetworkRoomConfig config)
    : config_(std::move(config)), owned_host_(config_.runtime), host_(&*owned_host_) {}

LoopbackRoom::LoopbackRoom(NetworkRoomConfig config, Runtime& host)
    : config_(std::move(config)), host_(&host) {}

Runtime& LoopbackRoom::host_runtime() noexcept { return *host_; }

const Runtime& LoopbackRoom::host_runtime() const noexcept { return *host_; }

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
  return {host_->tick(), host_->state_hash(), host_->save()};
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
    if (host_->submit_input({input.action_id, input.value_milli, next_host_sequence_++}) != RuntimeError::none) {
      return {NetworkError::runtime_failure, {}};
    }
  }
  if (host_->step(1U) != RuntimeError::none) return {NetworkError::runtime_failure, {}};
  for (auto& [client_id, client] : clients_) {
    static_cast<void>(client_id);
    client.pending_inputs.clear();
  }
  return {NetworkError::none, snapshot()};
}

NetworkSnapshot LoopbackRoom::current_snapshot() const { return snapshot(); }

NetworkError LoopbackRoom::apply_snapshot(Runtime& client, const NetworkSnapshot& remote) const {
  if (remote.archive.empty() || client.load_save(remote.archive) != RuntimeError::none ||
      client.tick() != remote.tick || client.state_hash() != remote.state_hash) {
    return NetworkError::snapshot_mismatch;
  }
  return NetworkError::none;
}

NetworkError LoopbackRoom::prepare_host_migration(NetworkHostMigration& migration) const {
  if (!valid()) return NetworkError::configuration_invalid;
  for (const auto& [client_id, client] : clients_) {
    static_cast<void>(client_id);
    if (!client.pending_inputs.empty()) return NetworkError::migration_pending_inputs;
  }
  migration = {config_, snapshot(), {}, next_client_id_, next_host_sequence_};
  migration.clients.reserve(clients_.size());
  for (const auto& [id, client] : clients_) {
    migration.clients.push_back({id, client.protocol_version, client.connected, 0U, client.reconnects});
  }
  return NetworkError::none;
}

NetworkError LoopbackRoom::adopt_host_migration(const NetworkHostMigration& migration) {
  SavedState decoded{};
  if (!valid() || !same_config(config_, migration.config) || migration.snapshot.archive.empty() ||
      migration.next_client_id == 0U || migration.next_host_sequence == 0U ||
      migration.clients.size() > config_.maximum_clients || !decode_save(migration.snapshot.archive, decoded) ||
      decoded.tick != migration.snapshot.tick || decoded.state_hash != migration.snapshot.state_hash) {
    return NetworkError::host_migration_failed;
  }
  std::map<std::uint32_t, Client> restored;
  for (const auto& client : migration.clients) {
    if (client.id == 0U || client.id >= migration.next_client_id || client.pending_inputs != 0U ||
        (client.protocol_version != config_.protocol_version && client.protocol_version + 1U != config_.protocol_version) ||
        !restored.emplace(client.id, Client{client.protocol_version, client.connected, client.reconnects, {}}).second) {
      return NetworkError::host_migration_failed;
    }
  }
  if (host_->load_save(migration.snapshot.archive) != RuntimeError::none || host_->tick() != migration.snapshot.tick ||
      host_->state_hash() != migration.snapshot.state_hash) {
    return NetworkError::host_migration_failed;
  }
  clients_ = std::move(restored);
  next_client_id_ = migration.next_client_id;
  next_host_sequence_ = migration.next_host_sequence;
  return NetworkError::none;
}

NetworkRoomInspection LoopbackRoom::inspect() const {
  NetworkRoomInspection inspection{host_->tick(), host_->state_hash(), {}};
  inspection.clients.reserve(clients_.size());
  for (const auto& [id, client] : clients_) {
    inspection.clients.push_back({id, client.protocol_version, client.connected,
        static_cast<std::uint32_t>(client.pending_inputs.size()), client.reconnects});
  }
  return inspection;
}

}  // namespace ludivra::kernel
