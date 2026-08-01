#include "command_buffer.hpp"

#include <utility>

namespace ludivra::kernel {

void CommandBuffer::add_integer(const std::uint32_t key, const std::int64_t delta) {
  entries_.push_back({CommandKind::add_integer, key, delta, 0, 0, 0});
}

void CommandBuffer::play_audio(const std::uint32_t id, const std::int32_t volume_milli) {
  entries_.push_back({CommandKind::play_audio, id, volume_milli, 0, 0, 0});
}

void CommandBuffer::stop_audio(const std::uint32_t id) {
  entries_.push_back({CommandKind::stop_audio, id, 0, 0, 0, 0});
}

void CommandBuffer::spawn_effect(
    const std::uint32_t id,
    const std::int32_t intensity_milli,
    const std::int32_t x_milli,
    const std::int32_t y_milli,
    const std::int32_t z_milli) {
  entries_.push_back({CommandKind::spawn_effect, id, intensity_milli, x_milli, y_milli, z_milli});
}

void CommandBuffer::start_timer(const std::uint32_t key, const std::uint64_t ticks) {
  entries_.push_back({CommandKind::start_timer, key, static_cast<std::int64_t>(ticks), 0, 0, 0});
}

void CommandBuffer::cancel_timer(const std::uint32_t key) {
  entries_.push_back({CommandKind::cancel_timer, key, 0, 0, 0, 0});
}

void CommandBuffer::set_region_delta(const StoredRegionKey region, StoredChunkDelta delta) {
  region_deltas_.push_back({region, std::move(delta)});
}

void CommandBuffer::clear() noexcept {
  entries_.clear();
  region_deltas_.clear();
}

const std::vector<GameplayCommand>& CommandBuffer::entries() const noexcept {
  return entries_;
}

const std::vector<RegionDeltaCommand>& CommandBuffer::region_deltas() const noexcept {
  return region_deltas_;
}

}  // namespace ludivra::kernel
