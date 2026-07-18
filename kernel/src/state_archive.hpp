#pragma once

#include <cstdint>
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

struct SavedState final {
  std::uint64_t tick;
  std::uint64_t state_hash;
  IntegerState integers;
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
