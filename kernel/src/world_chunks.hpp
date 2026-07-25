#pragma once

#include "world_position.hpp"

#include <cstdint>
#include <map>
#include <tuple>
#include <vector>

namespace ludivra::kernel {

/**
 * What a chunk is, independently of whether it is loaded. Generation is a pure
 * function of this identity, which is what lets a world be regenerated instead of
 * stored, and lets two machines agree without exchanging terrain.
 */
struct ChunkIdentity final {
  std::uint16_t dimension;
  std::int32_t x;
  std::int32_t y;
  std::int32_t z;
  std::uint32_t generator_id;
  std::uint32_t generator_version;

  [[nodiscard]] auto ordering() const noexcept {
    return std::tie(dimension, x, y, z, generator_id, generator_version);
  }
};

[[nodiscard]] bool operator<(const ChunkIdentity& left, const ChunkIdentity& right) noexcept;
[[nodiscard]] bool operator==(const ChunkIdentity& left, const ChunkIdentity& right) noexcept;

/// Seed of a chunk, derived by domain separation per ADR 0018. Adding a chunk or a
/// system never shifts the sequence of another.
[[nodiscard]] std::uint64_t chunk_seed(std::uint64_t root_seed, const ChunkIdentity& identity) noexcept;

/// Lifecycle declared by ADR 0019. Any transition outside the legal set is a
/// defect, not a state to recover from silently.
enum class ChunkState : std::uint8_t {
  unloaded,
  requested,
  generating,
  ready_for_mesh,
  meshing,
  resident,
  dirty,
  saving,
  evictable
};

[[nodiscard]] bool legal_chunk_transition(ChunkState from, ChunkState to) noexcept;

enum class ChunkError : std::uint8_t {
  none,
  transition_invalid,
  unknown_chunk,
  leaked_resources
};

struct ChunkRecord final {
  ChunkIdentity identity;
  ChunkState state;
  std::uint64_t content_hash;
  /// Resources the chunk still owns. Discarding with anything left is a leak.
  std::uint32_t resident_resources;
};

/// Registry of chunks and their lifecycle. It holds no terrain: terrain is derived
/// from the identity, and this is the bookkeeping that says what exists right now.
class ChunkRegistry final {
 public:
  [[nodiscard]] ChunkError request(const ChunkIdentity& identity);
  [[nodiscard]] ChunkError transition(const ChunkIdentity& identity, ChunkState next);
  [[nodiscard]] ChunkError set_content_hash(const ChunkIdentity& identity, std::uint64_t hash);
  [[nodiscard]] ChunkError set_resident_resources(const ChunkIdentity& identity, std::uint32_t count);

  /// Removes an evictable chunk. A chunk that still owns resources is a leak and
  /// stays, so the defect is visible instead of being freed by forgetting.
  [[nodiscard]] ChunkError discard(const ChunkIdentity& identity);

  [[nodiscard]] ChunkState state(const ChunkIdentity& identity) const noexcept;
  [[nodiscard]] std::vector<ChunkRecord> snapshot() const;
  /// Hash over every chunk in coordinate order, so two runs can be compared.
  [[nodiscard]] std::uint64_t world_hash() const noexcept;

 private:
  std::map<ChunkIdentity, ChunkRecord> chunks_;
};

}  // namespace ludivra::kernel
