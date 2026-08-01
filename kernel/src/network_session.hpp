#pragma once

#include "runtime.hpp"

#include <cstdint>
#include <map>
#include <span>
#include <string>
#include <vector>

namespace ludivra::kernel {

constexpr std::uint32_t network_protocol_version = 2U;

/** Values both peers must agree on before a procedural session can begin. */
struct NetworkWorldIdentity final {
  std::uint64_t seed;
  std::string generator_id;
  std::uint32_t generator_version;
  std::uint64_t content_hash;
};

struct NetworkRoomConfig final {
  RuntimeConfig runtime;
  NetworkWorldIdentity world;
  std::uint32_t protocol_version;
  std::uint32_t maximum_clients;
  std::uint32_t maximum_inputs_per_client;
};

struct NetworkPeerHello final {
  std::uint32_t protocol_version;
  NetworkWorldIdentity world;
};

struct NetworkClientInput final {
  std::uint32_t action_id;
  std::int32_t value_milli;
  std::uint64_t client_sequence;
};

struct NetworkSnapshot final {
  std::uint64_t tick;
  std::uint64_t state_hash;
  std::vector<std::uint8_t> archive;
};

enum class NetworkError : std::uint8_t {
  none,
  configuration_invalid,
  protocol_version_unsupported,
  world_identity_mismatch,
  room_full,
  client_unknown,
  client_already_connected,
  client_input_backlog,
  client_sent_state,
  runtime_failure,
  snapshot_mismatch,
  migration_pending_inputs,
  host_migration_failed
};

struct NetworkClientInspection final {
  std::uint32_t id;
  std::uint32_t protocol_version;
  bool connected;
  std::uint32_t pending_inputs;
  std::uint64_t reconnects;
};

struct NetworkRoomInspection final {
  std::uint64_t tick;
  std::uint64_t state_hash;
  std::vector<NetworkClientInspection> clients;
};

struct NetworkAdvance final {
  NetworkError error;
  NetworkSnapshot snapshot;
};

/** A handoff carries an authoritative snapshot and only peer lifecycle data;
 * generated world data and client-owned state are never transferred. */
struct NetworkHostMigration final {
  NetworkRoomConfig config;
  NetworkSnapshot snapshot;
  std::vector<NetworkClientInspection> clients;
  std::uint32_t next_client_id;
  std::uint64_t next_host_sequence;
};

/** Deterministic in-process transport. It owns the sole authoritative Runtime:
 * peers supply logical input only, while snapshots are checked logical saves.
 * Its wire-neutral semantics are the reference adapter for future WebRTC and
 * Steam transports. */
class LoopbackRoom final {
 public:
  explicit LoopbackRoom(NetworkRoomConfig config);

  [[nodiscard]] Runtime& host_runtime() noexcept;
  [[nodiscard]] const Runtime& host_runtime() const noexcept;
  [[nodiscard]] NetworkError connect(const NetworkPeerHello& hello, std::uint32_t& client_id, NetworkSnapshot& snapshot);
  [[nodiscard]] NetworkError disconnect(std::uint32_t client_id);
  [[nodiscard]] NetworkError reconnect(std::uint32_t client_id, const NetworkPeerHello& hello, NetworkSnapshot& snapshot);
  [[nodiscard]] NetworkError submit_input(std::uint32_t client_id, NetworkClientInput input);
  /// A client can never upload a snapshot or arbitrary state to the host.
  [[nodiscard]] NetworkError submit_client_state(std::uint32_t client_id, std::span<const std::uint8_t> state) const;
  [[nodiscard]] NetworkAdvance advance();
  [[nodiscard]] NetworkError apply_snapshot(Runtime& client, const NetworkSnapshot& snapshot) const;
  [[nodiscard]] NetworkError prepare_host_migration(NetworkHostMigration& migration) const;
  [[nodiscard]] NetworkError adopt_host_migration(const NetworkHostMigration& migration);
  [[nodiscard]] NetworkRoomInspection inspect() const;

 private:
  struct Client final {
    std::uint32_t protocol_version;
    bool connected;
    std::uint64_t reconnects;
    std::vector<NetworkClientInput> pending_inputs;
  };

  [[nodiscard]] bool valid() const noexcept;
  [[nodiscard]] bool compatible(const NetworkPeerHello& hello) const noexcept;
  [[nodiscard]] NetworkSnapshot snapshot() const;

  NetworkRoomConfig config_;
  Runtime host_;
  std::map<std::uint32_t, Client> clients_;
  std::uint32_t next_client_id_{1U};
  std::uint64_t next_host_sequence_{1U};
};

}  // namespace ludivra::kernel
