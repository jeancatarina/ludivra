#include "command_buffer.hpp"

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

void CommandBuffer::clear() noexcept {
  entries_.clear();
}

const std::vector<GameplayCommand>& CommandBuffer::entries() const noexcept {
  return entries_;
}

}  // namespace ludivra::kernel
