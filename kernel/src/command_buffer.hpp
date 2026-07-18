#pragma once

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

enum class CommandKind : std::uint8_t {
  add_integer,
  play_audio,
  stop_audio,
  spawn_effect
};

struct GameplayCommand final {
  CommandKind kind;
  std::uint32_t id;
  std::int64_t value;
  std::int32_t x_milli;
  std::int32_t y_milli;
  std::int32_t z_milli;
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
  void clear() noexcept;
  [[nodiscard]] const std::vector<GameplayCommand>& entries() const noexcept;

 private:
  std::vector<GameplayCommand> entries_;
};

}  // namespace ludivra::kernel
