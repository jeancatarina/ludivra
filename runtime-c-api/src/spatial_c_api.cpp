#include "ludivra/spatial.h"

#include "regional_world.hpp"

#include <cstddef>
#include <new>
#include <type_traits>
#include <vector>

struct ludivra_spatial_world final {
  explicit ludivra_spatial_world(const ludivra::kernel::RegionalWorldConfig config) : value(config) {}

  ludivra::kernel::RegionalWorld value;
};

namespace {

ludivra_spatial_result to_public(const ludivra::kernel::RegionalWorldError error) noexcept {
  using ludivra::kernel::RegionalWorldError;
  switch (error) {
    case RegionalWorldError::none: return LUDIVRA_SPATIAL_OK;
    case RegionalWorldError::configuration_invalid: return LUDIVRA_SPATIAL_ERROR_CONFIGURATION_INVALID;
    case RegionalWorldError::entity_invalid: return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
    case RegionalWorldError::entity_unknown: return LUDIVRA_SPATIAL_ERROR_ENTITY_UNKNOWN;
    case RegionalWorldError::dimension_mismatch: return LUDIVRA_SPATIAL_ERROR_DIMENSION_MISMATCH;
    case RegionalWorldError::coordinate_overflow: return LUDIVRA_SPATIAL_ERROR_COORDINATE_OVERFLOW;
  }
  return LUDIVRA_SPATIAL_ERROR_INTERNAL;
}

bool valid_region(const ludivra_spatial_region* region) noexcept {
  return region != nullptr;
}

ludivra::kernel::SpatialRegion to_kernel(const ludivra_spatial_region region) noexcept {
  return {region.dimension, region.x, region.y, region.z};
}

static_assert(sizeof(ludivra_spatial_location) == LUDIVRA_SPATIAL_LOCATION_RECORD_SIZE);
static_assert(std::is_standard_layout_v<ludivra_spatial_location>);

}  // namespace

uint32_t ludivra_spatial_abi_version(void) { return LUDIVRA_SPATIAL_ABI_VERSION; }

const char* ludivra_spatial_result_message(const ludivra_spatial_result result) {
  switch (result) {
    case LUDIVRA_SPATIAL_OK: return "ok";
    case LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT: return "invalid argument";
    case LUDIVRA_SPATIAL_ERROR_ALLOCATION: return "allocation failure";
    case LUDIVRA_SPATIAL_ERROR_CONFIGURATION_INVALID: return "spatial configuration is invalid";
    case LUDIVRA_SPATIAL_ERROR_ENTITY_UNKNOWN: return "spatial entity is unknown";
    case LUDIVRA_SPATIAL_ERROR_DIMENSION_MISMATCH: return "spatial position dimension does not match world";
    case LUDIVRA_SPATIAL_ERROR_COORDINATE_OVERFLOW: return "spatial coordinate overflows the world range";
    case LUDIVRA_SPATIAL_ERROR_BUFFER_TOO_SMALL: return "output buffer too small";
    case LUDIVRA_SPATIAL_ERROR_INTERNAL: return "internal spatial failure";
  }
  return "unknown spatial result";
}

ludivra_spatial_result ludivra_spatial_world_create(
    const ludivra_spatial_world_config* config,
    ludivra_spatial_world** out_world) {
  if (out_world == nullptr) return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
  *out_world = nullptr;
  if (config == nullptr || config->struct_size != sizeof(ludivra_spatial_world_config)) {
    return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
  }
  if (config->region_extent_chunks == 0U) return LUDIVRA_SPATIAL_ERROR_CONFIGURATION_INVALID;
  try {
    *out_world = new ludivra_spatial_world({config->dimension, config->region_extent_chunks});
    return LUDIVRA_SPATIAL_OK;
  } catch (const std::bad_alloc&) {
    return LUDIVRA_SPATIAL_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_SPATIAL_ERROR_INTERNAL;
  }
}

void ludivra_spatial_world_destroy(ludivra_spatial_world* world) { delete world; }

ludivra_spatial_result ludivra_spatial_world_put(
    ludivra_spatial_world* world,
    const uint32_t entity_id,
    const ludivra_spatial_global_position* position) {
  if (world == nullptr || position == nullptr || position->struct_size != sizeof(ludivra_spatial_global_position)) {
    return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public(world->value.put(entity_id, {position->dimension, position->x_milli, position->y_milli, position->z_milli}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_SPATIAL_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_SPATIAL_ERROR_INTERNAL;
  }
}

ludivra_spatial_result ludivra_spatial_world_translate(
    ludivra_spatial_world* world,
    const uint32_t entity_id,
    const ludivra_spatial_offset* offset) {
  if (world == nullptr || entity_id == 0U || offset == nullptr || offset->struct_size != sizeof(ludivra_spatial_offset)) {
    return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
  }
  try {
    return to_public(world->value.translate(entity_id, {offset->x_milli, offset->y_milli, offset->z_milli}));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_SPATIAL_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_SPATIAL_ERROR_INTERNAL;
  }
}

ludivra_spatial_result ludivra_spatial_world_locate(
    const ludivra_spatial_world* world,
    const uint32_t entity_id,
    ludivra_spatial_location* out_location) {
  if (world == nullptr || out_location == nullptr || out_location->struct_size != sizeof(ludivra_spatial_location)) {
    return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
  }
  ludivra::kernel::SpatialEntityLocation location{};
  const auto result = to_public(world->value.locate(entity_id, location));
  if (result != LUDIVRA_SPATIAL_OK) return result;
  *out_location = {sizeof(ludivra_spatial_location), location.entity_id, location.region.dimension, 0U,
      location.region.x, location.region.y, location.region.z,
      location.position.x_milli, location.position.y_milli, location.position.z_milli};
  return LUDIVRA_SPATIAL_OK;
}

ludivra_spatial_result ludivra_spatial_world_entities_in_count(
    const ludivra_spatial_world* world,
    const ludivra_spatial_region* region,
    uint32_t* out_count) {
  if (world == nullptr || !valid_region(region) || out_count == nullptr) return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
  const auto entities = world->value.entities_in(to_kernel(*region));
  *out_count = static_cast<uint32_t>(entities.size());
  return LUDIVRA_SPATIAL_OK;
}

ludivra_spatial_result ludivra_spatial_world_entities_in_write(
    const ludivra_spatial_world* world,
    const ludivra_spatial_region* region,
    uint32_t* entity_ids,
    const uint32_t capacity,
    uint32_t* out_count) {
  if (world == nullptr || !valid_region(region) || out_count == nullptr || (capacity > 0U && entity_ids == nullptr)) {
    return LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT;
  }
  const auto entities = world->value.entities_in(to_kernel(*region));
  *out_count = static_cast<uint32_t>(entities.size());
  if (entities.size() > capacity) return LUDIVRA_SPATIAL_ERROR_BUFFER_TOO_SMALL;
  for (std::size_t index = 0; index < entities.size(); ++index) entity_ids[index] = entities[index];
  return LUDIVRA_SPATIAL_OK;
}
