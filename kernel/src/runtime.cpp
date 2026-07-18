#include "runtime.hpp"
#include "generated/presentation_events.hpp"

#include <algorithm>
#include <limits>
#include <tuple>
#include <utility>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_prime = 1099511628211ULL;
constexpr std::uint8_t tick_marker = 0xA5U;

}  // namespace

Runtime::Runtime(const RuntimeConfig config)
    : config_(config), max_pending_inputs_(config.max_pending_inputs) {
  mix_u32(state_hash_, config.tick_rate_hz);
  mix_u32(state_hash_, config.max_pending_inputs);
  mix_u64(state_hash_, config.seed);
  replay_initial_state_ = {tick_, state_hash_, integer_state_};
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
  std::string next_source(source);
  if (!lua_.load(source)) {
    return RuntimeError::script_failure;
  }
  gameplay_source_.swap(next_source);
  return RuntimeError::none;
}

std::int64_t Runtime::integer_state(const std::uint32_t key) const noexcept {
  const auto found = integer_state_.find(key);
  return found == integer_state_.end() ? 0 : found->second;
}

const std::string& Runtime::last_error() const noexcept {
  return lua_.last_error();
}

const std::vector<PresentationEvent>& Runtime::presentation_events() const noexcept {
  return presentation_events_;
}

void Runtime::clear_presentation_events() noexcept {
  presentation_events_.clear();
}

std::vector<std::uint8_t> Runtime::save() const {
  return encode_save({tick_, state_hash_, integer_state_});
}

RuntimeError Runtime::load_save(const std::span<const std::uint8_t> bytes) {
  if (!pending_inputs_.empty()) {
    return RuntimeError::pending_inputs;
  }
  SavedState decoded{};
  if (!decode_save(bytes, decoded)) {
    return RuntimeError::archive_invalid;
  }
  SavedState next_replay_state = decoded;
  tick_ = decoded.tick;
  state_hash_ = decoded.state_hash;
  integer_state_.swap(decoded.integers);
  replay_initial_state_ = std::move(next_replay_state);
  replay_frames_.clear();
  commands_.clear();
  presentation_events_.clear();
  return RuntimeError::none;
}

std::vector<std::uint8_t> Runtime::replay() const {
  return encode_replay({config_.tick_rate_hz, config_.max_pending_inputs, config_.seed,
      replay_initial_state_, tick_, state_hash_, replay_frames_});
}

RuntimeError Runtime::verify_replay(const std::span<const std::uint8_t> bytes) const {
  ReplayState decoded{};
  if (!decode_replay(bytes, decoded)) {
    return RuntimeError::archive_invalid;
  }
  Runtime verification({decoded.tick_rate_hz, decoded.max_pending_inputs, decoded.seed});
  if (!gameplay_source_.empty() && verification.load_gameplay(gameplay_source_) != RuntimeError::none) {
    return RuntimeError::script_failure;
  }
  verification.tick_ = decoded.initial_state.tick;
  verification.state_hash_ = decoded.initial_state.state_hash;
  verification.integer_state_ = decoded.initial_state.integers;
  verification.replay_initial_state_ = decoded.initial_state;
  for (const auto& frame : decoded.frames) {
    for (const auto& input : frame.inputs) {
      if (verification.submit_input({input.action_id, input.value_milli, input.sequence}) !=
          RuntimeError::none) {
        return RuntimeError::replay_mismatch;
      }
    }
    if (verification.step(1U) != RuntimeError::none) {
      return RuntimeError::replay_mismatch;
    }
    verification.clear_presentation_events();
  }
  return verification.tick() == decoded.expected_tick &&
          verification.state_hash() == decoded.expected_hash
      ? RuntimeError::none
      : RuntimeError::replay_mismatch;
}

void Runtime::mix_byte(std::uint64_t& hash, const std::uint8_t value) noexcept {
  hash ^= value;
  hash *= fnv_prime;
}

void Runtime::mix_u32(std::uint64_t& hash, const std::uint32_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 32; shift += 8) {
    mix_byte(hash, static_cast<std::uint8_t>((value >> shift) & 0xFFU));
  }
}

void Runtime::mix_u64(std::uint64_t& hash, const std::uint64_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 64; shift += 8) {
    mix_byte(hash, static_cast<std::uint8_t>((value >> shift) & 0xFFU));
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
  ReplayFrame replay_frame;
  replay_frame.inputs.reserve(pending_inputs_.size());
  for (const auto& input : pending_inputs_) {
    replay_frame.inputs.push_back({input.action_id, input.value_milli, input.sequence});
  }
  replay_frames_.push_back(std::move(replay_frame));

  RuntimeError command_result = RuntimeError::none;
  try {
    command_result = apply_commands();
  } catch (...) {
    replay_frames_.pop_back();
    commands_.clear();
    throw;
  }
  if (command_result != RuntimeError::none) {
    replay_frames_.pop_back();
    commands_.clear();
    return command_result;
  }

  ++tick_;
  mix_byte(state_hash_, tick_marker);
  mix_u64(state_hash_, tick_);
  mix_u32(state_hash_, static_cast<std::uint32_t>(pending_inputs_.size()));

  for (const auto& input : pending_inputs_) {
    mix_u64(state_hash_, input.sequence);
    mix_u32(state_hash_, input.action_id);
    mix_u32(state_hash_, static_cast<std::uint32_t>(input.value_milli));
  }
  pending_inputs_.clear();
  return RuntimeError::none;
}

RuntimeError Runtime::apply_commands() {
  IntegerState committed = integer_state_;
  auto committed_events = presentation_events_;
  auto committed_sequence = next_presentation_sequence_;
  std::uint64_t committed_hash = state_hash_;
  for (const auto& command : commands_.entries()) {
    switch (command.kind) {
      case CommandKind::add_integer: {
        const auto found = committed.find(command.id);
        const auto current = found == committed.end() ? 0 : found->second;
        if ((command.value > 0 && current > std::numeric_limits<std::int64_t>::max() - command.value) ||
            (command.value < 0 && current < std::numeric_limits<std::int64_t>::min() - command.value)) {
          return RuntimeError::integer_overflow;
        }
        const auto value = current + command.value;
        committed[command.id] = value;
        mix_byte(committed_hash, 0xC1U);
        mix_u32(committed_hash, command.id);
        mix_u64(committed_hash, static_cast<std::uint64_t>(value));
        break;
      }
      case CommandKind::play_audio:
      case CommandKind::stop_audio:
      case CommandKind::spawn_effect: {
        if (committed_events.size() >= contract::maximum_presentation_events) {
          return RuntimeError::presentation_limit;
        }
        const auto kind = command.kind == CommandKind::play_audio
            ? PresentationEventKind::audio_play
            : command.kind == CommandKind::stop_audio
                ? PresentationEventKind::audio_stop
                : PresentationEventKind::effect_spawn;
        committed_events.push_back({kind, command.id, static_cast<std::int32_t>(command.value),
            command.x_milli, command.y_milli, command.z_milli, committed_sequence++});
        const auto marker = kind == PresentationEventKind::audio_play
            ? 0xD1U
            : kind == PresentationEventKind::audio_stop ? 0xD2U : 0xE1U;
        mix_byte(committed_hash, marker);
        mix_u32(committed_hash, command.id);
        mix_u32(committed_hash, static_cast<std::uint32_t>(command.value));
        mix_u32(committed_hash, static_cast<std::uint32_t>(command.x_milli));
        mix_u32(committed_hash, static_cast<std::uint32_t>(command.y_milli));
        mix_u32(committed_hash, static_cast<std::uint32_t>(command.z_milli));
        break;
      }
    }
  }
  integer_state_.swap(committed);
  presentation_events_.swap(committed_events);
  next_presentation_sequence_ = committed_sequence;
  state_hash_ = committed_hash;
  return RuntimeError::none;
}

}  // namespace ludivra::kernel
