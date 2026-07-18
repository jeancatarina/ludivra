#include "runtime.hpp"

#include <algorithm>
#include <limits>
#include <tuple>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_prime = 1099511628211ULL;
constexpr std::uint8_t tick_marker = 0xA5U;

}  // namespace

Runtime::Runtime(const RuntimeConfig config) noexcept : max_pending_inputs_(config.max_pending_inputs) {
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

RuntimeError Runtime::step(const std::uint32_t tick_count) noexcept {
  if (tick_count > std::numeric_limits<std::uint64_t>::max() - tick_) {
    return RuntimeError::tick_overflow;
  }

  for (std::uint32_t index = 0; index < tick_count; ++index) {
    commit_tick();
  }
  return RuntimeError::none;
}

std::uint64_t Runtime::tick() const noexcept {
  return tick_;
}

std::uint64_t Runtime::state_hash() const noexcept {
  return state_hash_;
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

void Runtime::commit_tick() noexcept {
  std::sort(pending_inputs_.begin(), pending_inputs_.end(), [](const auto& left, const auto& right) {
    return std::tie(left.sequence, left.action_id, left.value_milli) <
           std::tie(right.sequence, right.action_id, right.value_milli);
  });

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
}

}  // namespace ludivra::kernel
