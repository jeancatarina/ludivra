#include "region_storage.hpp"

#include <algorithm>
#include <array>
#include <fstream>
#include <limits>
#include <map>
#include <span>
#include <string>
#include <system_error>
#include <utility>

#if defined(__APPLE__) || defined(__linux__)
#include <fcntl.h>
#include <unistd.h>
#endif

namespace ludivra::kernel {
namespace {

constexpr std::array<std::uint8_t, 4> region_magic{'L', 'D', 'W', 'R'};
constexpr std::array<std::uint8_t, 4> journal_magic{'L', 'D', 'W', 'J'};
constexpr std::uint32_t storage_version = 1U;
constexpr std::uint32_t legacy_storage_version = 0U;
constexpr std::uint32_t maximum_regions_per_transaction = 4'096U;
constexpr std::uint32_t maximum_deltas_per_region = 65'536U;
constexpr std::uint32_t maximum_generator_id_bytes = 128U;
constexpr std::uint64_t fnv_offset = 14695981039346656037ULL;
constexpr std::uint64_t fnv_prime = 1099511628211ULL;

class Writer final {
 public:
  void bytes(const std::span<const std::uint8_t> value) { output_.insert(output_.end(), value.begin(), value.end()); }

  void u32(const std::uint32_t value) {
    for (std::uint32_t shift = 0U; shift < 32U; shift += 8U) output_.push_back(static_cast<std::uint8_t>(value >> shift));
  }

  void u64(const std::uint64_t value) {
    for (std::uint32_t shift = 0U; shift < 64U; shift += 8U) output_.push_back(static_cast<std::uint8_t>(value >> shift));
  }

  void i32(const std::int32_t value) { u32(static_cast<std::uint32_t>(value)); }

  void text(const std::string& value) {
    u32(static_cast<std::uint32_t>(value.size()));
    for (const char character : value) output_.push_back(static_cast<std::uint8_t>(character));
  }

  void blob(const std::span<const std::uint8_t> value) {
    u32(static_cast<std::uint32_t>(value.size()));
    bytes(value);
  }

  [[nodiscard]] bool finish(const std::uint64_t maximum_bytes, std::vector<std::uint8_t>& output) {
    if (output_.size() > maximum_bytes - sizeof(std::uint64_t)) return false;
    std::uint64_t checksum = fnv_offset;
    for (const std::uint8_t byte : output_) checksum = (checksum ^ byte) * fnv_prime;
    u64(checksum);
    output = std::move(output_);
    return true;
  }

 private:
  std::vector<std::uint8_t> output_;
};

class Reader final {
 public:
  explicit Reader(const std::span<const std::uint8_t> bytes) : bytes_(bytes) {}

  [[nodiscard]] bool checksum_valid() const {
    if (bytes_.size() < sizeof(std::uint64_t)) return false;
    std::uint64_t checksum = fnv_offset;
    for (std::size_t index = 0U; index < content_size(); ++index) checksum = (checksum ^ bytes_[index]) * fnv_prime;
    std::uint64_t received = 0U;
    for (std::uint32_t shift = 0U; shift < 64U; shift += 8U) {
      received |= static_cast<std::uint64_t>(bytes_[content_size() + (shift / 8U)]) << shift;
    }
    return checksum == received;
  }

  [[nodiscard]] bool magic(const std::array<std::uint8_t, 4>& expected) {
    if (position_ + expected.size() > content_size()) return false;
    const bool matches = std::equal(expected.begin(), expected.end(), bytes_.begin() + static_cast<std::ptrdiff_t>(position_));
    position_ += expected.size();
    return matches;
  }

  [[nodiscard]] bool u32(std::uint32_t& value) {
    if (position_ + sizeof(value) > content_size()) return false;
    value = 0U;
    for (std::uint32_t shift = 0U; shift < 32U; shift += 8U) value |= static_cast<std::uint32_t>(bytes_[position_++]) << shift;
    return true;
  }

  [[nodiscard]] bool u64(std::uint64_t& value) {
    if (position_ + sizeof(value) > content_size()) return false;
    value = 0U;
    for (std::uint32_t shift = 0U; shift < 64U; shift += 8U) value |= static_cast<std::uint64_t>(bytes_[position_++]) << shift;
    return true;
  }

  [[nodiscard]] bool i32(std::int32_t& value) {
    std::uint32_t encoded = 0U;
    if (!u32(encoded)) return false;
    value = static_cast<std::int32_t>(encoded);
    return true;
  }

  [[nodiscard]] bool text(std::string& value, const std::uint32_t maximum_bytes) {
    std::uint32_t size = 0U;
    if (!u32(size) || size > maximum_bytes || position_ + size > content_size()) return false;
    value.assign(reinterpret_cast<const char*>(bytes_.data() + position_), size);
    position_ += size;
    return true;
  }

  [[nodiscard]] bool blob(std::vector<std::uint8_t>& value, const std::uint64_t maximum_bytes) {
    std::uint32_t size = 0U;
    if (!u32(size) || size > maximum_bytes || position_ + size > content_size()) return false;
    value.assign(bytes_.begin() + static_cast<std::ptrdiff_t>(position_),
        bytes_.begin() + static_cast<std::ptrdiff_t>(position_ + size));
    position_ += size;
    return true;
  }

  [[nodiscard]] bool complete() const noexcept { return position_ == content_size(); }

 private:
  [[nodiscard]] std::size_t content_size() const noexcept {
    return bytes_.size() < sizeof(std::uint64_t) ? 0U : bytes_.size() - sizeof(std::uint64_t);
  }

  std::span<const std::uint8_t> bytes_;
  std::size_t position_ = 0U;
};

[[nodiscard]] bool config_valid(const RegionStorageConfig& config) noexcept {
  return !config.root.empty() && config.maximum_region_bytes >= 128U;
}

[[nodiscard]] bool region_valid(const StoredRegion& region, const std::uint64_t maximum_bytes) {
  if (region.generator_id.empty() || region.generator_id.size() > maximum_generator_id_bytes || region.generator_version == 0U ||
      region.deltas.size() > maximum_deltas_per_region) {
    return false;
  }
  std::uint64_t total = region.persistent_entities.size() + region.summary.size() + region.construction_graph.size();
  if (total > maximum_bytes) return false;
  for (const StoredChunkDelta& delta : region.deltas) {
    total += delta.payload.size();
    if (total > maximum_bytes) return false;
  }
  return true;
}

[[nodiscard]] bool same_delta_key(const StoredChunkDelta& first, const StoredChunkDelta& second) noexcept {
  return first.chunk_x == second.chunk_x && first.chunk_y == second.chunk_y && first.chunk_z == second.chunk_z;
}

void write_key(Writer& writer, const StoredRegionKey key) {
  writer.u32(key.dimension);
  writer.i32(key.x);
  writer.i32(key.y);
  writer.i32(key.z);
}

[[nodiscard]] bool read_key(Reader& reader, StoredRegionKey& key) {
  std::uint32_t dimension = 0U;
  if (!reader.u32(dimension) || dimension > std::numeric_limits<std::uint16_t>::max() ||
      !reader.i32(key.x) || !reader.i32(key.y) || !reader.i32(key.z)) {
    return false;
  }
  key.dimension = static_cast<std::uint16_t>(dimension);
  return true;
}

[[nodiscard]] RegionStorageError encode_region(const StoredRegion& region, const std::uint64_t maximum_bytes,
    std::vector<std::uint8_t>& bytes) {
  if (!region_valid(region, maximum_bytes)) return RegionStorageError::region_invalid;
  std::vector<StoredChunkDelta> deltas = region.deltas;
  std::sort(deltas.begin(), deltas.end(), [](const StoredChunkDelta& first, const StoredChunkDelta& second) {
    if (first.chunk_x != second.chunk_x) return first.chunk_x < second.chunk_x;
    if (first.chunk_y != second.chunk_y) return first.chunk_y < second.chunk_y;
    return first.chunk_z < second.chunk_z;
  });
  if (std::adjacent_find(deltas.begin(), deltas.end(), same_delta_key) != deltas.end()) return RegionStorageError::region_invalid;

  Writer writer;
  writer.bytes(region_magic);
  writer.u32(storage_version);
  write_key(writer, region.key);
  writer.text(region.generator_id);
  writer.u32(region.generator_version);
  writer.u64(region.seed);
  writer.u32(static_cast<std::uint32_t>(deltas.size()));
  for (const StoredChunkDelta& delta : deltas) {
    writer.i32(delta.chunk_x);
    writer.i32(delta.chunk_y);
    writer.i32(delta.chunk_z);
    writer.blob(delta.payload);
  }
  writer.blob(region.persistent_entities);
  writer.blob(region.summary);
  writer.blob(region.construction_graph);
  return writer.finish(maximum_bytes, bytes) ? RegionStorageError::none : RegionStorageError::growth_budget_exceeded;
}

[[nodiscard]] RegionStorageError decode_region(const std::span<const std::uint8_t> bytes, const std::uint64_t maximum_bytes,
    StoredRegion& region, std::uint32_t* decoded_version = nullptr) {
  if (bytes.size() > maximum_bytes) return RegionStorageError::growth_budget_exceeded;
  Reader reader(bytes);
  if (!reader.checksum_valid()) return RegionStorageError::checksum_mismatch;
  std::uint32_t version = 0U;
  StoredRegion decoded{};
  std::uint32_t count = 0U;
  if (!reader.magic(region_magic) || !reader.u32(version)) return RegionStorageError::region_invalid;
  if (version != storage_version && version != legacy_storage_version) return RegionStorageError::version_unsupported;
  if (!read_key(reader, decoded.key) || !reader.text(decoded.generator_id, maximum_generator_id_bytes) ||
      !reader.u32(decoded.generator_version) || !reader.u64(decoded.seed) || !reader.u32(count) ||
      count > maximum_deltas_per_region) {
    return RegionStorageError::region_invalid;
  }
  decoded.deltas.reserve(count);
  for (std::uint32_t index = 0U; index < count; ++index) {
    StoredChunkDelta delta{};
    if (!reader.i32(delta.chunk_x) || !reader.i32(delta.chunk_y) || !reader.i32(delta.chunk_z) ||
        !reader.blob(delta.payload, maximum_bytes)) {
      return RegionStorageError::region_invalid;
    }
    decoded.deltas.push_back(std::move(delta));
  }
  if (!reader.blob(decoded.persistent_entities, maximum_bytes)) return RegionStorageError::region_invalid;
  // Version 0 predates region summaries. Migration preserves all persisted
  // deltas/entities/construction data and initializes that additive field empty.
  if ((version == legacy_storage_version && !reader.blob(decoded.construction_graph, maximum_bytes)) ||
      (version == storage_version && (!reader.blob(decoded.summary, maximum_bytes) ||
          !reader.blob(decoded.construction_graph, maximum_bytes))) ||
      !reader.complete() || !region_valid(decoded, maximum_bytes)) {
    return RegionStorageError::region_invalid;
  }
  std::sort(decoded.deltas.begin(), decoded.deltas.end(), [](const StoredChunkDelta& first, const StoredChunkDelta& second) {
    if (first.chunk_x != second.chunk_x) return first.chunk_x < second.chunk_x;
    if (first.chunk_y != second.chunk_y) return first.chunk_y < second.chunk_y;
    return first.chunk_z < second.chunk_z;
  });
  if (std::adjacent_find(decoded.deltas.begin(), decoded.deltas.end(), same_delta_key) != decoded.deltas.end()) {
    return RegionStorageError::region_invalid;
  }
  if (decoded_version != nullptr) *decoded_version = version;
  region = std::move(decoded);
  return RegionStorageError::none;
}

[[nodiscard]] RegionStorageError encode_journal(const std::span<const StoredRegion> regions, const std::uint64_t maximum_bytes,
    std::vector<std::uint8_t>& bytes) {
  if (regions.empty() || regions.size() > maximum_regions_per_transaction) return RegionStorageError::region_invalid;
  std::map<StoredRegionKey, std::vector<std::uint8_t>> encoded;
  for (const StoredRegion& region : regions) {
    std::vector<std::uint8_t> record;
    if (const auto error = encode_region(region, maximum_bytes, record); error != RegionStorageError::none) return error;
    if (!encoded.emplace(region.key, std::move(record)).second) return RegionStorageError::region_invalid;
  }
  Writer writer;
  writer.bytes(journal_magic);
  writer.u32(storage_version);
  writer.u32(static_cast<std::uint32_t>(encoded.size()));
  for (const auto& [key, record] : encoded) {
    static_cast<void>(key);
    writer.blob(record);
  }
  const std::uint64_t journal_budget = maximum_bytes * static_cast<std::uint64_t>(maximum_regions_per_transaction);
  return writer.finish(journal_budget, bytes) ? RegionStorageError::none : RegionStorageError::growth_budget_exceeded;
}

[[nodiscard]] RegionStorageError decode_journal(const std::span<const std::uint8_t> bytes, const std::uint64_t maximum_bytes,
    std::vector<StoredRegion>& regions) {
  Reader reader(bytes);
  if (!reader.checksum_valid()) return RegionStorageError::checksum_mismatch;
  std::uint32_t version = 0U;
  std::uint32_t count = 0U;
  if (!reader.magic(journal_magic) || !reader.u32(version)) return RegionStorageError::region_invalid;
  if (version != storage_version) return RegionStorageError::version_unsupported;
  if (!reader.u32(count) || count == 0U || count > maximum_regions_per_transaction) return RegionStorageError::region_invalid;
  std::map<StoredRegionKey, StoredRegion> ordered;
  for (std::uint32_t index = 0U; index < count; ++index) {
    std::vector<std::uint8_t> encoded;
    StoredRegion region{};
    if (!reader.blob(encoded, maximum_bytes)) return RegionStorageError::region_invalid;
    if (const auto error = decode_region(encoded, maximum_bytes, region); error != RegionStorageError::none) return error;
    if (!ordered.emplace(region.key, std::move(region)).second) return RegionStorageError::region_invalid;
  }
  if (!reader.complete()) return RegionStorageError::region_invalid;
  regions.clear();
  regions.reserve(ordered.size());
  for (auto& [key, region] : ordered) {
    static_cast<void>(key);
    regions.push_back(std::move(region));
  }
  return RegionStorageError::none;
}

[[nodiscard]] std::filesystem::path region_path(const RegionStorageConfig& config, const StoredRegionKey key) {
  return config.root / ("region-d" + std::to_string(key.dimension) + "-x" + std::to_string(key.x) +
      "-y" + std::to_string(key.y) + "-z" + std::to_string(key.z) + ".ldwr");
}

[[nodiscard]] std::filesystem::path journal_path(const RegionStorageConfig& config) { return config.root / "journal.ldwj"; }

[[nodiscard]] std::filesystem::path temporary_path(const std::filesystem::path& target) {
  return std::filesystem::path(target.string() + ".tmp");
}

[[nodiscard]] bool synchronize_file(const std::filesystem::path& path) {
#if defined(__APPLE__) || defined(__linux__)
  const int descriptor = open(path.c_str(), O_RDONLY);
  if (descriptor < 0) return false;
  const bool synchronized = fsync(descriptor) == 0;
  static_cast<void>(close(descriptor));
  return synchronized;
#else
  static_cast<void>(path);
  return true;
#endif
}

[[nodiscard]] RegionStorageError ensure_root(const RegionStorageConfig& config) {
  if (!config_valid(config)) return RegionStorageError::configuration_invalid;
  std::error_code error;
  std::filesystem::create_directories(config.root, error);
  return error ? RegionStorageError::write_not_atomic : RegionStorageError::none;
}

[[nodiscard]] RegionStorageError write_atomically(const RegionStorageConfig& config, const std::filesystem::path& target,
    const std::span<const std::uint8_t> bytes) {
  if (const auto error = ensure_root(config); error != RegionStorageError::none) return error;
  const std::filesystem::path temporary = temporary_path(target);
  {
    std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
    if (!output.is_open()) return RegionStorageError::write_not_atomic;
    output.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    output.flush();
    if (!output.good()) return RegionStorageError::write_not_atomic;
  }
  if (!synchronize_file(temporary)) return RegionStorageError::write_not_atomic;
  std::error_code error;
  std::filesystem::rename(temporary, target, error);
  return error ? RegionStorageError::write_not_atomic : RegionStorageError::none;
}

[[nodiscard]] RegionStorageError read_file(const std::filesystem::path& path, const std::uint64_t maximum_bytes,
    std::vector<std::uint8_t>& bytes) {
  std::error_code error;
  if (!std::filesystem::is_regular_file(path, error)) return RegionStorageError::region_missing;
  const std::uintmax_t size = std::filesystem::file_size(path, error);
  if (error || size > maximum_bytes || size > std::numeric_limits<std::size_t>::max()) return RegionStorageError::growth_budget_exceeded;
  std::ifstream input(path, std::ios::binary);
  if (!input.is_open()) return RegionStorageError::region_missing;
  bytes.resize(static_cast<std::size_t>(size));
  input.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
  return input.good() || input.eof() ? RegionStorageError::none : RegionStorageError::region_missing;
}

[[nodiscard]] RegionStorageError erase_file(const std::filesystem::path& path) {
  std::error_code error;
  if (!std::filesystem::remove(path, error) || error) return RegionStorageError::write_not_atomic;
  return RegionStorageError::none;
}

}  // namespace

RegionStorage::RegionStorage(RegionStorageConfig config) : config_(std::move(config)) {}

RegionStorageError RegionStorage::write_region(const StoredRegion& region) {
  if (!config_valid(config_)) return RegionStorageError::configuration_invalid;
  std::vector<std::uint8_t> bytes;
  if (const auto error = encode_region(region, config_.maximum_region_bytes, bytes); error != RegionStorageError::none) return error;
  return write_atomically(config_, region_path(config_, region.key), bytes);
}

RegionStorageError RegionStorage::read_region(const StoredRegionKey key, StoredRegion& region) const {
  if (!config_valid(config_)) return RegionStorageError::configuration_invalid;
  std::vector<std::uint8_t> bytes;
  if (const auto error = read_file(region_path(config_, key), config_.maximum_region_bytes, bytes); error != RegionStorageError::none) return error;
  if (const auto error = decode_region(bytes, config_.maximum_region_bytes, region); error != RegionStorageError::none) return error;
  return region.key == key ? RegionStorageError::none : RegionStorageError::region_invalid;
}

RegionStorageError RegionStorage::begin_transaction(const std::span<const StoredRegion> regions) {
  if (const auto error = ensure_root(config_); error != RegionStorageError::none) return error;
  std::error_code filesystem_error;
  if (std::filesystem::exists(journal_path(config_), filesystem_error)) return RegionStorageError::journal_pending;
  if (filesystem_error || std::filesystem::exists(temporary_path(journal_path(config_)), filesystem_error)) {
    return RegionStorageError::journal_incomplete;
  }
  std::vector<std::uint8_t> bytes;
  if (const auto error = encode_journal(regions, config_.maximum_region_bytes, bytes); error != RegionStorageError::none) return error;
  return write_atomically(config_, journal_path(config_), bytes);
}

RegionStorageError RegionStorage::commit_pending_transaction() {
  std::vector<std::uint8_t> bytes;
  const std::uint64_t journal_budget = config_.maximum_region_bytes * static_cast<std::uint64_t>(maximum_regions_per_transaction);
  if (const auto error = read_file(journal_path(config_), journal_budget, bytes); error != RegionStorageError::none) return error;
  std::vector<StoredRegion> regions;
  if (const auto error = decode_journal(bytes, config_.maximum_region_bytes, regions); error != RegionStorageError::none) return error;
  for (const StoredRegion& region : regions) {
    if (const auto error = write_region(region); error != RegionStorageError::none) return error;
  }
  return erase_file(journal_path(config_));
}

RegionStorageError RegionStorage::write_transaction(const std::span<const StoredRegion> regions) {
  if (const auto error = begin_transaction(regions); error != RegionStorageError::none) return error;
  return commit_pending_transaction();
}

RegionRecoveryReport RegionStorage::recover() {
  if (const auto error = ensure_root(config_); error != RegionStorageError::none) return {error, 0U, false};
  std::error_code filesystem_error;
  const std::filesystem::path temporary = temporary_path(journal_path(config_));
  const bool incomplete = std::filesystem::exists(temporary, filesystem_error);
  if (filesystem_error) return {RegionStorageError::write_not_atomic, 0U, false};
  if (incomplete) {
    std::filesystem::remove(temporary, filesystem_error);
    if (filesystem_error) return {RegionStorageError::write_not_atomic, 0U, false};
  }
  if (!std::filesystem::exists(journal_path(config_), filesystem_error)) {
    return {incomplete ? RegionStorageError::journal_incomplete : RegionStorageError::none, 0U, incomplete};
  }
  if (filesystem_error) return {RegionStorageError::write_not_atomic, 0U, incomplete};

  std::vector<std::uint8_t> bytes;
  const std::uint64_t journal_budget = config_.maximum_region_bytes * static_cast<std::uint64_t>(maximum_regions_per_transaction);
  if (const auto error = read_file(journal_path(config_), journal_budget, bytes); error != RegionStorageError::none) return {error, 0U, incomplete};
  std::vector<StoredRegion> regions;
  if (const auto error = decode_journal(bytes, config_.maximum_region_bytes, regions); error != RegionStorageError::none) return {error, 0U, incomplete};
  if (const auto error = commit_pending_transaction(); error != RegionStorageError::none) return {error, 0U, incomplete};
  return {RegionStorageError::none, static_cast<std::uint32_t>(regions.size()), incomplete};
}

RegionStorageError RegionStorage::compact_region(const StoredRegionKey key) {
  StoredRegion region{};
  if (const auto error = read_region(key, region); error != RegionStorageError::none) return error;
  return write_region(region);
}

RegionStorageError RegionStorage::migrate_region(const StoredRegionKey key, bool& migrated) {
  migrated = false;
  if (!config_valid(config_)) return RegionStorageError::configuration_invalid;
  std::vector<std::uint8_t> bytes;
  if (const auto error = read_file(region_path(config_, key), config_.maximum_region_bytes, bytes); error != RegionStorageError::none) return error;
  StoredRegion region{};
  std::uint32_t version = 0U;
  if (const auto error = decode_region(bytes, config_.maximum_region_bytes, region, &version); error != RegionStorageError::none) return error;
  if (region.key != key) return RegionStorageError::region_invalid;
  if (version == storage_version) return RegionStorageError::none;
  if (const auto error = write_region(region); error != RegionStorageError::none) return error;
  migrated = true;
  return RegionStorageError::none;
}

RegionStorageInspection RegionStorage::inspect() const {
  RegionStorageInspection inspection{};
  std::error_code error;
  inspection.pending_journal = std::filesystem::exists(journal_path(config_), error) && !error;
  inspection.incomplete_journal = std::filesystem::exists(temporary_path(journal_path(config_)), error) && !error;
  if (error || !std::filesystem::is_directory(config_.root, error)) return inspection;
  for (const std::filesystem::directory_entry& entry : std::filesystem::directory_iterator(config_.root, error)) {
    if (error || !entry.is_regular_file() || entry.path().extension() != ".ldwr") continue;
    StoredRegion region{};
    std::vector<std::uint8_t> bytes;
    if (read_file(entry.path(), config_.maximum_region_bytes, bytes) == RegionStorageError::none &&
        decode_region(bytes, config_.maximum_region_bytes, region) == RegionStorageError::none) {
      inspection.regions.push_back(region.key);
    }
  }
  std::sort(inspection.regions.begin(), inspection.regions.end());
  return inspection;
}

}  // namespace ludivra::kernel
