#include "regional_world.hpp"

#include <tuple>

namespace ludivra::kernel {
namespace {

std::int32_t floor_region(const std::int32_t chunk, const std::uint32_t extent) noexcept {
  const auto divisor = static_cast<std::int64_t>(extent);
  auto quotient = static_cast<std::int64_t>(chunk) / divisor;
  const auto remainder = static_cast<std::int64_t>(chunk) % divisor;
  if (remainder < 0) --quotient;
  return static_cast<std::int32_t>(quotient);
}

}  // namespace

bool operator<(const SpatialRegion& left, const SpatialRegion& right) noexcept {
  return std::tie(left.dimension, left.x, left.y, left.z) < std::tie(right.dimension, right.x, right.y, right.z);
}

bool operator==(const SpatialRegion& left, const SpatialRegion& right) noexcept {
  return left.dimension == right.dimension && left.x == right.x && left.y == right.y && left.z == right.z;
}

RegionalWorld::RegionalWorld(const RegionalWorldConfig config) : config_(config) {}

SpatialRegion RegionalWorld::region_for(const WorldPosition position) const noexcept {
  return {position.dimension,
      floor_region(position.chunk_x, config_.region_extent_chunks),
      floor_region(position.chunk_y, config_.region_extent_chunks),
      floor_region(position.chunk_z, config_.region_extent_chunks)};
}

SpatialGlobalPosition RegionalWorld::global_for(const WorldPosition position) const noexcept {
  return {position.dimension,
      static_cast<std::int64_t>(position.chunk_x) * chunk_extent_scaled + position.local_x,
      static_cast<std::int64_t>(position.chunk_y) * chunk_extent_scaled + position.local_y,
      static_cast<std::int64_t>(position.chunk_z) * chunk_extent_scaled + position.local_z};
}

void RegionalWorld::erase_from_partition(const std::uint32_t entity_id, const WorldPosition position) {
  const auto partition = partitions_.find(region_for(position));
  if (partition == partitions_.end()) return;
  partition->second.erase(entity_id);
  if (partition->second.empty()) partitions_.erase(partition);
}

RegionalWorldError RegionalWorld::put(const std::uint32_t entity_id, const SpatialGlobalPosition position) {
  if (config_.region_extent_chunks == 0U) return RegionalWorldError::configuration_invalid;
  if (entity_id == 0U) return RegionalWorldError::entity_invalid;
  if (position.dimension != config_.dimension) return RegionalWorldError::dimension_mismatch;
  const auto normalized = normalize({position.dimension, 0, 0, 0,
      position.x_milli, position.y_milli, position.z_milli});
  if (normalized.error == WorldPositionError::chunk_coordinate_overflow) return RegionalWorldError::coordinate_overflow;
  const auto previous = entities_.find(entity_id);
  if (previous != entities_.end()) erase_from_partition(entity_id, previous->second);
  entities_.insert_or_assign(entity_id, normalized.value);
  partitions_[region_for(normalized.value)].insert(entity_id);
  return RegionalWorldError::none;
}

RegionalWorldError RegionalWorld::translate(const std::uint32_t entity_id, const WorldOffset offset) {
  if (config_.region_extent_chunks == 0U) return RegionalWorldError::configuration_invalid;
  const auto found = entities_.find(entity_id);
  if (found == entities_.end()) return RegionalWorldError::entity_unknown;
  const auto moved = ludivra::kernel::translate(found->second, offset);
  if (moved.error == WorldPositionError::chunk_coordinate_overflow) return RegionalWorldError::coordinate_overflow;
  erase_from_partition(entity_id, found->second);
  found->second = moved.value;
  partitions_[region_for(moved.value)].insert(entity_id);
  return RegionalWorldError::none;
}

RegionalWorldError RegionalWorld::locate(const std::uint32_t entity_id, SpatialEntityLocation& out) const {
  if (config_.region_extent_chunks == 0U) return RegionalWorldError::configuration_invalid;
  const auto found = entities_.find(entity_id);
  if (found == entities_.end()) return RegionalWorldError::entity_unknown;
  out = {entity_id, region_for(found->second), global_for(found->second)};
  return RegionalWorldError::none;
}

std::vector<std::uint32_t> RegionalWorld::entities_in(const SpatialRegion region) const {
  if (region.dimension != config_.dimension) return {};
  const auto found = partitions_.find(region);
  if (found == partitions_.end()) return {};
  return {found->second.begin(), found->second.end()};
}

std::vector<SpatialPartitionRecord> RegionalWorld::inspect_partitions() const {
  std::vector<SpatialPartitionRecord> records;
  records.reserve(partitions_.size());
  for (const auto& [region, entities] : partitions_) {
    records.push_back({region, static_cast<std::uint32_t>(entities.size())});
  }
  return records;
}

RegionalWorldConfig RegionalWorld::config() const noexcept { return config_; }

}  // namespace ludivra::kernel
