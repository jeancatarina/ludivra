#pragma once

#include "region_storage.hpp"

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

enum class CommandKind : std::uint8_t {
  add_integer,
  play_audio,
  stop_audio,
  spawn_effect,
  start_timer,
  cancel_timer
};

struct GameplayCommand final {
  CommandKind kind;
  std::uint32_t id;
  std::int64_t value;
  std::int32_t x_milli;
  std::int32_t y_milli;
  std::int32_t z_milli;
};

/** A Lua world write is only staged during script execution. Runtime applies
 * the entire ordered set at its authoritative commit boundary. */
struct RegionDeltaCommand final {
  StoredRegionKey region;
  StoredChunkDelta delta;
};

class CommandBuffer final {
 public:
  void add_integer(std::uint32_t key, std::int64_t delta);
  void play_audio(std::uint32_t id, std::int32_t volume_milli);
  void stop_audio(std::uint32_t id);
  void spawn_effect(
      std::uint32_t id,
      std::int32_t intensity_milli,
      std::int32_t x_milli,
      std::int32_t y_milli,
      std::int32_t z_milli);
  void start_timer(std::uint32_t key, std::uint64_t ticks);
  void cancel_timer(std::uint32_t key);
  void set_region_delta(StoredRegionKey region, StoredChunkDelta delta);
  void clear() noexcept;
  [[nodiscard]] const std::vector<GameplayCommand>& entries() const noexcept;
  [[nodiscard]] const std::vector<RegionDeltaCommand>& region_deltas() const noexcept;

 private:
  std::vector<GameplayCommand> entries_;
  std::vector<RegionDeltaCommand> region_deltas_;
};

}  // namespace ludivra::kernel
