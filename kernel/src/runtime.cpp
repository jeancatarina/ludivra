#include "runtime.hpp"

#include <algorithm>
#include <limits>
#include <tuple>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_prime = 1099511628211ULL;
constexpr std::uint8_t tick_marker = 0xA5U;

}  // namespace

Runtime::Runtime(const RuntimeConfig config) : max_pending_inputs_(config.max_pending_inputs) {
  mix_u32(config.tick_rate_hz);
  mix_u32(config.max_pending_inputs);
  mix_u64(config.seed);
}

RuntimeError Runtime::submit_input(const LogicalInput input) {
  if (pending_inputs_.size() >= max_pending_inputs_) {
    return RuntimeError::input_limit;
  }
  pending_inputs_.push_back(input);
  return RuntimeError::none;
}

RuntimeError Runtime::step(const std::uint32_t tick_count) {
  if (tick_count > std::numeric_limits<std::uint64_t>::max() - tick_) {
    return RuntimeError::tick_overflow;
  }

  for (std::uint32_t index = 0; index < tick_count; ++index) {
    const auto result = commit_tick();
    if (result != RuntimeError::none) {
      return result;
    }
  }
  return RuntimeError::none;
}

std::uint64_t Runtime::tick() const noexcept {
  return tick_;
}

std::uint64_t Runtime::state_hash() const noexcept {
  return state_hash_;
}

RuntimeError Runtime::load_gameplay(const std::string_view source) {
  return lua_.load(source) ? RuntimeError::none : RuntimeError::script_failure;
}

std::int64_t Runtime::integer_state(const std::uint32_t key) const noexcept {
  const auto found = integer_state_.find(key);
  return found == integer_state_.end() ? 0 : found->second;
}

const std::string& Runtime::last_error() const noexcept {
  return lua_.last_error();
}

void Runtime::mix_byte(const std::uint8_t value) noexcept {
  state_hash_ ^= value;
  state_hash_ *= fnv_prime;
}

void Runtime::mix_u32(const std::uint32_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 32; shift += 8) {
    mix_byte(static_cast<std::uint8_t>((value >> shift) & 0xFFU));
  }
}

void Runtime::mix_u64(const std::uint64_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 64; shift += 8) {
    mix_byte(static_cast<std::uint8_t>((value >> shift) & 0xFFU));
  }
}

RuntimeError Runtime::commit_tick() {
  std::sort(pending_inputs_.begin(), pending_inputs_.end(), [](const auto& left, const auto& right) {
    return std::tie(left.sequence, left.action_id, left.value_milli) <
           std::tie(right.sequence, right.action_id, right.value_milli);
  });

  commands_.clear();
  for (const auto& input : pending_inputs_) {
    if (!lua_.on_input({input.action_id, input.value_milli, input.sequence}, integer_state_, commands_)) {
      commands_.clear();
      return RuntimeError::script_failure;
    }
  }
  const auto command_result = apply_commands();
  if (command_result != RuntimeError::none) {
    commands_.clear();
    return command_result;
  }

  ++tick_;
  mix_byte(tick_marker);
  mix_u64(tick_);
  mix_u32(static_cast<std::uint32_t>(pending_inputs_.size()));

  for (const auto& input : pending_inputs_) {
    mix_u64(input.sequence);
    mix_u32(input.action_id);
    mix_u32(static_cast<std::uint32_t>(input.value_milli));
  }
  pending_inputs_.clear();
  return RuntimeError::none;
}

RuntimeError Runtime::apply_commands() {
  IntegerState projected;
  for (const auto& command : commands_.additions()) {
    const auto projected_value = projected.find(command.key);
    const auto current = projected_value == projected.end()
        ? integer_state(command.key)
        : projected_value->second;
    if ((command.delta > 0 && current > std::numeric_limits<std::int64_t>::max() - command.delta) ||
        (command.delta < 0 && current < std::numeric_limits<std::int64_t>::min() - command.delta)) {
      return RuntimeError::integer_overflow;
    }
    projected[command.key] = current + command.delta;
  }
  for (const auto& command : commands_.additions()) {
    auto& value = integer_state_[command.key];
    value += command.delta;
    mix_byte(0xC1U);
    mix_u32(command.key);
    mix_u64(static_cast<std::uint64_t>(value));
  }
  return RuntimeError::none;
}

}  // namespace ludivra::kernel
