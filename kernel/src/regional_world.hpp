#pragma once

#include "world_position.hpp"

#include <cstdint>
#include <map>
#include <set>
#include <vector>

namespace ludivra::kernel {

/** Public callers use global fixed-point coordinates; chunks remain internal. */
struct RegionalWorldConfig final {
  std::uint16_t dimension;
  std::uint32_t region_extent_chunks;
};

struct SpatialGlobalPosition final {
  std::uint16_t dimension;
  std::int64_t x_milli;
  std::int64_t y_milli;
  std::int64_t z_milli;
};

struct SpatialRegion final {
  std::uint16_t dimension;
  std::int32_t x;
  std::int32_t y;
  std::int32_t z;
};

[[nodiscard]] bool operator<(const SpatialRegion& left, const SpatialRegion& right) noexcept;
[[nodiscard]] bool operator==(const SpatialRegion& left, const SpatialRegion& right) noexcept;

struct SpatialEntityLocation final {
  std::uint32_t entity_id;
  SpatialRegion region;
  SpatialGlobalPosition position;
};

struct SpatialPartitionRecord final {
  SpatialRegion region;
  std::uint32_t entity_count;
};

enum class RegionalWorldError : std::uint8_t {
  none,
  configuration_invalid,
  entity_invalid,
  entity_unknown,
  dimension_mismatch,
  coordinate_overflow
};

/**
 * Semantic spatial consumer boundary. The registry indexes entities by region,
 * while WorldPosition keeps its chunk/local representation private to the kernel.
 */
class RegionalWorld final {
 public:
  explicit RegionalWorld(RegionalWorldConfig config);

  [[nodiscard]] RegionalWorldError put(std::uint32_t entity_id, SpatialGlobalPosition position);
  [[nodiscard]] RegionalWorldError translate(std::uint32_t entity_id, WorldOffset offset);
  [[nodiscard]] RegionalWorldError locate(std::uint32_t entity_id, SpatialEntityLocation& out) const;
  [[nodiscard]] std::vector<std::uint32_t> entities_in(SpatialRegion region) const;
  [[nodiscard]] std::vector<SpatialPartitionRecord> inspect_partitions() const;
  [[nodiscard]] RegionalWorldConfig config() const noexcept;

 private:
  RegionalWorldConfig config_;
  std::map<std::uint32_t, WorldPosition> entities_;
  std::map<SpatialRegion, std::set<std::uint32_t>> partitions_;

  [[nodiscard]] SpatialRegion region_for(WorldPosition position) const noexcept;
  [[nodiscard]] SpatialGlobalPosition global_for(WorldPosition position) const noexcept;
  void erase_from_partition(std::uint32_t entity_id, WorldPosition position);
};

}  // namespace ludivra::kernel
