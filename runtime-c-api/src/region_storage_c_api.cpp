#include "ludivra/region_storage.h"

#include "region_storage.hpp"

#include <cstddef>
#include <new>
#include <string>
#include <utility>
#include <vector>

struct ludivra_region_storage final {
  explicit ludivra_region_storage(ludivra::kernel::RegionStorageConfig config) : value(std::move(config)) {}

  ludivra::kernel::RegionStorage value;
};

namespace {

ludivra_region_storage_result to_public(const ludivra::kernel::RegionStorageError error) noexcept {
  using ludivra::kernel::RegionStorageError;
  switch (error) {
    case RegionStorageError::none: return LUDIVRA_REGION_STORAGE_OK;
    case RegionStorageError::configuration_invalid: return LUDIVRA_REGION_STORAGE_ERROR_CONFIGURATION_INVALID;
    case RegionStorageError::region_invalid: return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
    case RegionStorageError::region_missing: return LUDIVRA_REGION_STORAGE_ERROR_REGION_MISSING;
    case RegionStorageError::journal_pending: return LUDIVRA_REGION_STORAGE_ERROR_JOURNAL_PENDING;
    case RegionStorageError::journal_incomplete: return LUDIVRA_REGION_STORAGE_ERROR_JOURNAL_INCOMPLETE;
    case RegionStorageError::checksum_mismatch: return LUDIVRA_REGION_STORAGE_ERROR_CHECKSUM_MISMATCH;
    case RegionStorageError::version_unsupported: return LUDIVRA_REGION_STORAGE_ERROR_VERSION_UNSUPPORTED;
    case RegionStorageError::write_not_atomic: return LUDIVRA_REGION_STORAGE_ERROR_WRITE_NOT_ATOMIC;
    case RegionStorageError::growth_budget_exceeded: return LUDIVRA_REGION_STORAGE_ERROR_GROWTH_BUDGET_EXCEEDED;
  }
  return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
}

bool valid_bytes(const ludivra_region_storage_bytes value) noexcept {
  return value.size == 0U || value.data != nullptr;
}

ludivra::kernel::StoredRegionKey to_kernel(const ludivra_region_storage_key key) noexcept {
  return {key.dimension, key.x, key.y, key.z};
}

ludivra_region_storage_key to_public(const ludivra::kernel::StoredRegionKey key) noexcept {
  return {key.dimension, 0U, key.x, key.y, key.z};
}

std::vector<std::uint8_t> copy_bytes(const ludivra_region_storage_bytes value) {
  if (value.size == 0U) return {};
  return {value.data, value.data + value.size};
}

}  // namespace

uint32_t ludivra_region_storage_abi_version(void) { return LUDIVRA_REGION_STORAGE_ABI_VERSION; }

const char* ludivra_region_storage_result_message(const ludivra_region_storage_result result) {
  switch (result) {
    case LUDIVRA_REGION_STORAGE_OK: return "ok";
    case LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT: return "invalid region-storage argument";
    case LUDIVRA_REGION_STORAGE_ERROR_ALLOCATION: return "region-storage allocation failure";
    case LUDIVRA_REGION_STORAGE_ERROR_CONFIGURATION_INVALID: return "region-storage configuration is invalid";
    case LUDIVRA_REGION_STORAGE_ERROR_REGION_MISSING: return "stored region is missing";
    case LUDIVRA_REGION_STORAGE_ERROR_JOURNAL_PENDING: return "region-storage journal is pending";
    case LUDIVRA_REGION_STORAGE_ERROR_JOURNAL_INCOMPLETE: return "region-storage journal temporary was discarded";
    case LUDIVRA_REGION_STORAGE_ERROR_CHECKSUM_MISMATCH: return "region-storage checksum mismatch";
    case LUDIVRA_REGION_STORAGE_ERROR_VERSION_UNSUPPORTED: return "region-storage version is unsupported";
    case LUDIVRA_REGION_STORAGE_ERROR_WRITE_NOT_ATOMIC: return "region-storage atomic write failed";
    case LUDIVRA_REGION_STORAGE_ERROR_GROWTH_BUDGET_EXCEEDED: return "region-storage growth budget exceeded";
    case LUDIVRA_REGION_STORAGE_ERROR_INTERNAL: return "internal region-storage error";
    case LUDIVRA_REGION_STORAGE_ERROR_BUFFER_TOO_SMALL: return "region-storage output buffer too small";
  }
  return "unknown region-storage result";
}

ludivra_region_storage_result ludivra_region_storage_create(
    const ludivra_region_storage_config* config,
    ludivra_region_storage** out_storage) {
  if (out_storage == nullptr) return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  *out_storage = nullptr;
  if (config == nullptr || config->struct_size != sizeof(ludivra_region_storage_config) ||
      config->root_utf8 == nullptr || config->root_utf8_bytes == 0U || config->maximum_region_bytes < 128U) {
    return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  }
  try {
    *out_storage = new ludivra_region_storage({std::string(config->root_utf8, config->root_utf8_bytes), config->maximum_region_bytes});
    return LUDIVRA_REGION_STORAGE_OK;
  } catch (const std::bad_alloc&) {
    return LUDIVRA_REGION_STORAGE_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
  }
}

void ludivra_region_storage_destroy(ludivra_region_storage* storage) { delete storage; }

ludivra_region_storage_result ludivra_region_storage_write(
    ludivra_region_storage* storage,
    const ludivra_region_storage_record* record) {
  if (storage == nullptr || record == nullptr || record->struct_size != sizeof(ludivra_region_storage_record) ||
      record->generator_id_utf8 == nullptr || record->generator_id_utf8_bytes == 0U || record->generator_version == 0U ||
      (record->delta_count > 0U && record->deltas == nullptr) || !valid_bytes(record->persistent_entities) ||
      !valid_bytes(record->summary) || !valid_bytes(record->construction_graph)) {
    return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  }
  try {
    std::vector<ludivra::kernel::StoredChunkDelta> deltas;
    deltas.reserve(record->delta_count);
    for (std::uint32_t index = 0U; index < record->delta_count; ++index) {
      const ludivra_region_storage_delta& delta = record->deltas[index];
      if (!valid_bytes(delta.payload)) return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
      deltas.push_back({delta.chunk_x, delta.chunk_y, delta.chunk_z, copy_bytes(delta.payload)});
    }
    const ludivra::kernel::StoredRegion region{to_kernel(record->key),
        std::string(record->generator_id_utf8, record->generator_id_utf8_bytes), record->generator_version, record->seed,
        std::move(deltas), copy_bytes(record->persistent_entities), copy_bytes(record->summary), copy_bytes(record->construction_graph)};
    return to_public(storage->value.write_region(region));
  } catch (const std::bad_alloc&) {
    return LUDIVRA_REGION_STORAGE_ERROR_ALLOCATION;
  } catch (...) {
    return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
  }
}

ludivra_region_storage_result ludivra_region_storage_recover(
    ludivra_region_storage* storage,
    ludivra_region_storage_recovery* out_recovery) {
  if (storage == nullptr || out_recovery == nullptr || out_recovery->struct_size != sizeof(ludivra_region_storage_recovery)) {
    return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  }
  try {
    const ludivra::kernel::RegionRecoveryReport recovery = storage->value.recover();
    out_recovery->replayed_regions = recovery.replayed_regions;
    out_recovery->discarded_incomplete_journal = recovery.discarded_incomplete_journal ? 1U : 0U;
    return to_public(recovery.error);
  } catch (...) {
    return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
  }
}

ludivra_region_storage_result ludivra_region_storage_compact(
    ludivra_region_storage* storage,
    const ludivra_region_storage_key* key) {
  if (storage == nullptr || key == nullptr) return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  try {
    return to_public(storage->value.compact_region(to_kernel(*key)));
  } catch (...) {
    return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
  }
}

ludivra_region_storage_result ludivra_region_storage_migrate(
    ludivra_region_storage* storage,
    const ludivra_region_storage_key* key,
    uint32_t* out_migrated) {
  if (storage == nullptr || key == nullptr || out_migrated == nullptr) return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  try {
    bool migrated = false;
    const auto result = storage->value.migrate_region(to_kernel(*key), migrated);
    *out_migrated = migrated ? 1U : 0U;
    return to_public(result);
  } catch (...) {
    return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
  }
}

ludivra_region_storage_result ludivra_region_storage_inspect_count(
    const ludivra_region_storage* storage,
    uint32_t* out_count) {
  if (storage == nullptr || out_count == nullptr) return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  try {
    *out_count = static_cast<uint32_t>(storage->value.inspect().regions.size());
    return LUDIVRA_REGION_STORAGE_OK;
  } catch (...) {
    return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
  }
}

ludivra_region_storage_result ludivra_region_storage_inspect_write(
    const ludivra_region_storage* storage,
    ludivra_region_storage_key* keys,
    const uint32_t capacity,
    uint32_t* out_count) {
  if (storage == nullptr || out_count == nullptr || (capacity > 0U && keys == nullptr)) {
    return LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT;
  }
  try {
    const auto inspection = storage->value.inspect();
    *out_count = static_cast<uint32_t>(inspection.regions.size());
    if (inspection.regions.size() > capacity) return LUDIVRA_REGION_STORAGE_ERROR_BUFFER_TOO_SMALL;
    for (std::size_t index = 0U; index < inspection.regions.size(); ++index) keys[index] = to_public(inspection.regions[index]);
    return LUDIVRA_REGION_STORAGE_OK;
  } catch (...) {
    return LUDIVRA_REGION_STORAGE_ERROR_INTERNAL;
  }
}
