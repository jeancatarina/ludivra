#pragma once

#include <cstdint>
#include <compare>
#include <filesystem>
#include <span>
#include <string>
#include <vector>

namespace ludivra::kernel {

enum class RegionStorageError : std::uint8_t {
  none,
  configuration_invalid,
  region_invalid,
  region_missing,
  journal_pending,
  journal_incomplete,
  checksum_mismatch,
  version_unsupported,
  write_not_atomic,
  growth_budget_exceeded
};

struct StoredRegionKey final {
  std::uint16_t dimension;
  std::int32_t x;
  std::int32_t y;
  std::int32_t z;

  [[nodiscard]] auto operator<=>(const StoredRegionKey&) const = default;
};

/** A delta is the only chunk-level payload persisted; generated base data is absent. */
struct StoredChunkDelta final {
  std::int32_t chunk_x;
  std::int32_t chunk_y;
  std::int32_t chunk_z;
  std::vector<std::uint8_t> payload;
};

struct StoredRegion final {
  StoredRegionKey key;
  std::string generator_id;
  std::uint32_t generator_version;
  std::uint64_t seed;
  std::vector<StoredChunkDelta> deltas;
  std::vector<std::uint8_t> persistent_entities;
  std::vector<std::uint8_t> summary;
  std::vector<std::uint8_t> construction_graph;
};

/** Deterministic fingerprint of the canonical region record. It is a reference
 * in logical saves and replays, never a replacement for the delta payload. */
[[nodiscard]] std::uint64_t stored_region_hash(const StoredRegion& region);

struct RegionStorageConfig final {
  std::filesystem::path root;
  std::uint64_t maximum_region_bytes;
};

struct RegionRecoveryReport final {
  RegionStorageError error;
  std::uint32_t replayed_regions;
  bool discarded_incomplete_journal;
};

struct RegionStorageInspection final {
  std::vector<StoredRegionKey> regions;
  bool pending_journal;
  bool incomplete_journal;
};

/**
 * Native region-delta storage. Writes never serialize a generated base chunk:
 * a multi-region transaction first becomes an intent journal, then each region
 * is replaced atomically, and recovery replays the complete intent.
 */
class RegionStorage final {
 public:
  explicit RegionStorage(RegionStorageConfig config);

  [[nodiscard]] RegionStorageError write_region(const StoredRegion& region);
  [[nodiscard]] RegionStorageError read_region(StoredRegionKey key, StoredRegion& region) const;
  [[nodiscard]] RegionStorageError begin_transaction(std::span<const StoredRegion> regions);
  [[nodiscard]] RegionStorageError commit_pending_transaction();
  [[nodiscard]] RegionStorageError write_transaction(std::span<const StoredRegion> regions);
  [[nodiscard]] RegionRecoveryReport recover();
  [[nodiscard]] RegionStorageError compact_region(StoredRegionKey key);
  [[nodiscard]] RegionStorageError migrate_region(StoredRegionKey key, bool& migrated);
  [[nodiscard]] RegionStorageInspection inspect() const;

 private:
  RegionStorageConfig config_;
};

}  // namespace ludivra::kernel
