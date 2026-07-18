#pragma once

#include "command_buffer.hpp"
#include "lua_sandbox.hpp"

#include <cstdint>
#include <string>
#include <string_view>
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
  input_limit,
  script_failure,
  integer_overflow
};

class Runtime final {
 public:
  explicit Runtime(RuntimeConfig config);

  [[nodiscard]] RuntimeError submit_input(LogicalInput input);
  [[nodiscard]] RuntimeError step(std::uint32_t tick_count);
  [[nodiscard]] std::uint64_t tick() const noexcept;
  [[nodiscard]] std::uint64_t state_hash() const noexcept;
  [[nodiscard]] RuntimeError load_gameplay(std::string_view source);
  [[nodiscard]] std::int64_t integer_state(std::uint32_t key) const noexcept;
  [[nodiscard]] const std::string& last_error() const noexcept;

 private:
  void mix_byte(std::uint8_t value) noexcept;
  void mix_u32(std::uint32_t value) noexcept;
  void mix_u64(std::uint64_t value) noexcept;
  [[nodiscard]] RuntimeError commit_tick();
  [[nodiscard]] RuntimeError apply_commands();

  std::uint64_t tick_{0};
  std::uint64_t state_hash_{14695981039346656037ULL};
  std::uint32_t max_pending_inputs_;
  std::vector<LogicalInput> pending_inputs_;
  IntegerState integer_state_;
  CommandBuffer commands_;
  LuaSandbox lua_;
};

}  // namespace ludivra::kernel
