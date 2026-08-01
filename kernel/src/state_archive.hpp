#pragma once

#include "logical_timers.hpp"
#include "random_streams.hpp"
#include "region_storage.hpp"
#include "statechart_runtime.hpp"

#include <cstdint>
#include <optional>
#include <span>
#include <unordered_map>
#include <vector>

namespace ludivra::kernel {

using IntegerState = std::unordered_map<std::uint32_t, std::int64_t>;

struct ArchiveInput final {
  std::uint32_t action_id;
  std::int32_t value_milli;
  std::uint64_t sequence;
};

struct ReplayFrame final {
  std::vector<ArchiveInput> inputs;
};

/** Logical archives refer to region data by identity and canonical fingerprint.
 * The actual deltas remain in LDWR, so saving a world never copies its
 * regenerable base or re-embeds regional payloads in LDSV/LDRP. */
struct RegionSaveReference final {
  StoredRegionKey key;
  std::string generator_id;
  std::uint32_t generator_version;
  std::uint64_t seed;
  std::uint64_t content_hash;
};

struct SavedState final {
  std::uint64_t tick;
  std::uint64_t state_hash;
  IntegerState integers;
  /// Stream positions travel with the state: a replay that restored integers but
  /// not the PRNG position would diverge on the first draw.
  std::vector<NamedRandomStream> streams;
  /// Timers are authoritative too: restoring without them would drop a pending
  /// expiry that the original run was counting on.
  std::vector<LogicalTimer> timers;
  /// Present only when a statechart has been installed for this runtime.
  std::optional<StatechartSnapshot> statechart;
  std::vector<RegionSaveReference> regions;
};

struct ReplayState final {
  std::uint32_t tick_rate_hz;
  std::uint32_t max_pending_inputs;
  std::uint64_t seed;
  SavedState initial_state;
  std::uint64_t expected_tick;
  std::uint64_t expected_hash;
  std::vector<ReplayFrame> frames;
};

[[nodiscard]] std::vector<std::uint8_t> encode_save(const SavedState& state);
[[nodiscard]] bool decode_save(std::span<const std::uint8_t> bytes, SavedState& state);
[[nodiscard]] std::vector<std::uint8_t> encode_replay(const ReplayState& replay);
[[nodiscard]] bool decode_replay(std::span<const std::uint8_t> bytes, ReplayState& replay);

}  // namespace ludivra::kernel
