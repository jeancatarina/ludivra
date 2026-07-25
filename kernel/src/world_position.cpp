#include "world_position.hpp"

#include <limits>

namespace ludivra::kernel {
namespace {

/// Floor division and the matching remainder. C++ truncates toward zero, which
/// would make a position just west of the origin land in the wrong chunk.
struct Division final {
  std::int64_t quotient;
  std::int64_t remainder;
};

Division floor_divide(const std::int64_t value, const std::int64_t divisor) noexcept {
  std::int64_t quotient = value / divisor;
  std::int64_t remainder = value % divisor;
  if (remainder != 0 && ((remainder < 0) != (divisor < 0))) {
    quotient -= 1;
    remainder += divisor;
  }
  return {quotient, remainder};
}

bool add_chunk_coordinate(const std::int32_t base, const std::int64_t delta, std::int32_t& out) noexcept {
  const std::int64_t sum = static_cast<std::int64_t>(base) + delta;
  if (sum < std::numeric_limits<std::int32_t>::min() || sum > std::numeric_limits<std::int32_t>::max()) {
    return false;
  }
  out = static_cast<std::int32_t>(sum);
  return true;
}

}  // namespace

WorldPositionResult normalize(const WorldPosition position) noexcept {
  WorldPosition normalized = position;
  const Division x = floor_divide(position.local_x, chunk_extent_scaled);
  const Division y = floor_divide(position.local_y, chunk_extent_scaled);
  const Division z = floor_divide(position.local_z, chunk_extent_scaled);
  if (!add_chunk_coordinate(position.chunk_x, x.quotient, normalized.chunk_x) ||
      !add_chunk_coordinate(position.chunk_y, y.quotient, normalized.chunk_y) ||
      !add_chunk_coordinate(position.chunk_z, z.quotient, normalized.chunk_z)) {
    return {position, WorldPositionError::chunk_coordinate_overflow};
  }
  normalized.local_x = x.remainder;
  normalized.local_y = y.remainder;
  normalized.local_z = z.remainder;
  return {normalized, WorldPositionError::none};
}

WorldPositionResult translate(const WorldPosition position, const WorldOffset offset) noexcept {
  // Chunk coordinates absorb the magnitude, so the local sums cannot overflow for
  // any offset the fixed-point range can express.
  const auto normalized = normalize(position);
  if (normalized.error != WorldPositionError::none) return normalized;

  WorldPosition moved = normalized.value;
  const Division x = floor_divide(offset.x, chunk_extent_scaled);
  const Division y = floor_divide(offset.y, chunk_extent_scaled);
  const Division z = floor_divide(offset.z, chunk_extent_scaled);
  if (!add_chunk_coordinate(moved.chunk_x, x.quotient, moved.chunk_x) ||
      !add_chunk_coordinate(moved.chunk_y, y.quotient, moved.chunk_y) ||
      !add_chunk_coordinate(moved.chunk_z, z.quotient, moved.chunk_z)) {
    return {position, WorldPositionError::chunk_coordinate_overflow};
  }
  moved.local_x += x.remainder;
  moved.local_y += y.remainder;
  moved.local_z += z.remainder;
  return normalize(moved);
}

WorldPositionError difference(
    const WorldPosition from,
    const WorldPosition to,
    WorldOffset& offset) noexcept {
  if (from.dimension != to.dimension) return WorldPositionError::dimension_mismatch;
  const auto left = normalize(from);
  const auto right = normalize(to);
  if (left.error != WorldPositionError::none) return left.error;
  if (right.error != WorldPositionError::none) return right.error;

  const auto axis = [](const std::int32_t from_chunk,
                       const std::int64_t from_local,
                       const std::int32_t to_chunk,
                       const std::int64_t to_local) noexcept {
    const std::int64_t chunks = static_cast<std::int64_t>(to_chunk) - static_cast<std::int64_t>(from_chunk);
    return chunks * chunk_extent_scaled + (to_local - from_local);
  };
  offset = {
      axis(left.value.chunk_x, left.value.local_x, right.value.chunk_x, right.value.local_x),
      axis(left.value.chunk_y, left.value.local_y, right.value.chunk_y, right.value.local_y),
      axis(left.value.chunk_z, left.value.local_z, right.value.chunk_z, right.value.local_z)};
  return WorldPositionError::none;
}

bool same_place(const WorldPosition left, const WorldPosition right) noexcept {
  const auto first = normalize(left);
  const auto second = normalize(right);
  if (first.error != WorldPositionError::none || second.error != WorldPositionError::none) return false;
  return first.value.dimension == second.value.dimension &&
      first.value.chunk_x == second.value.chunk_x &&
      first.value.chunk_y == second.value.chunk_y &&
      first.value.chunk_z == second.value.chunk_z &&
      first.value.local_x == second.value.local_x &&
      first.value.local_y == second.value.local_y &&
      first.value.local_z == second.value.local_z;
}

}  // namespace ludivra::kernel
