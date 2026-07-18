#pragma once

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

struct RuntimeConfig final {
  std::uint32_t tick_rate_hz;
  std::uint32_t max_pending_inputs;
  std::uint64_t seed;
};

struct LogicalInput final {
  std::uint32_t action_id;
  std::int32_t value_milli;
  std::uint64_t sequence;
};

enum class RuntimeError : std::uint8_t {
  none,
  tick_overflow,
  input_limit
};

class Runtime final {
 public:
  explicit Runtime(RuntimeConfig config) noexcept;

  [[nodiscard]] RuntimeError submit_input(LogicalInput input);
  [[nodiscard]] RuntimeError step(std::uint32_t tick_count) noexcept;
  [[nodiscard]] std::uint64_t tick() const noexcept;
  [[nodiscard]] std::uint64_t state_hash() const noexcept;

 private:
  void mix_byte(std::uint8_t value) noexcept;
  void mix_u32(std::uint32_t value) noexcept;
  void mix_u64(std::uint64_t value) noexcept;
  void commit_tick() noexcept;

  std::uint64_t tick_{0};
  std::uint64_t state_hash_{14695981039346656037ULL};
  std::uint32_t max_pending_inputs_;
  std::vector<LogicalInput> pending_inputs_;
};

}  // namespace ludivra::kernel
