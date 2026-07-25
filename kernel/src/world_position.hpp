#pragma once

#include <cstdint>

namespace ludivra::kernel {

/// Edge of a chunk in whole units. Kept small enough that a chunk-local value
/// never leaves the exact range of the declared scale.
inline constexpr std::int64_t chunk_extent_units = 32;

/// Scale of a local coordinate, as a power of ten, per ADR 0018.
inline constexpr std::uint8_t world_position_scale = 3;

inline constexpr std::int64_t chunk_extent_scaled = chunk_extent_units * 1'000;

/**
 * Authoritative position: dimension, chunk coordinate and a chunk-local offset in
 * the declared fixed-point scale.
 *
 * The split is what keeps precision constant everywhere in the world: the local
 * part never grows, so a position a million chunks from the origin is as exact as
 * one beside it. The layout itself is internal — gameplay moves and queries, it
 * does not read these fields as a permanent contract.
 */
struct WorldPosition final {
  std::uint16_t dimension;
  std::int32_t chunk_x;
  std::int32_t chunk_y;
  std::int32_t chunk_z;
  std::int64_t local_x;
  std::int64_t local_y;
  std::int64_t local_z;
};

enum class WorldPositionError : std::uint8_t {
  none,
  dimension_mismatch,
  chunk_coordinate_overflow
};

struct WorldPositionResult final {
  WorldPosition value;
  WorldPositionError error;
};

struct WorldOffset final {
  std::int64_t x;
  std::int64_t y;
  std::int64_t z;
};

/// Carries any local overflow into the chunk coordinate, so every position has one
/// canonical representation. Two equal places always compare equal.
[[nodiscard]] WorldPositionResult normalize(WorldPosition position) noexcept;

/// Translates by an offset in the declared scale, normalizing the result.
[[nodiscard]] WorldPositionResult translate(WorldPosition position, WorldOffset offset) noexcept;

/// Offset from `from` to `to`. Positions in different dimensions have no offset.
[[nodiscard]] WorldPositionError difference(
    WorldPosition from,
    WorldPosition to,
    WorldOffset& offset) noexcept;

[[nodiscard]] bool same_place(WorldPosition left, WorldPosition right) noexcept;

}  // namespace ludivra::kernel
