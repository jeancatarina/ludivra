#include "runtime.hpp"

#include "fixed_point.hpp"
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
    : config_(config), max_pending_inputs_(config.max_pending_inputs), random_streams_(config.seed) {
  mix_u32(state_hash_, config.tick_rate_hz);
  mix_u32(state_hash_, config.max_pending_inputs);
  mix_u64(state_hash_, config.seed);
  replay_initial_state_ = {tick_, state_hash_, integer_state_, random_streams_.snapshot(), timers_.snapshot(), std::nullopt};
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
  if (!lua_.load(source, symbols_)) {
    return RuntimeError::script_failure;
  }
  gameplay_source_.swap(next_source);
  return RuntimeError::none;
}

RuntimeError Runtime::load_content_pack(const std::string_view bytes) {
  if (!lua_.load_content_pack(bytes)) return RuntimeError::content_pack_invalid;
  // Kept so replay verification rebuilds a runtime that sees the same content.
  content_pack_source_.assign(bytes);
  return RuntimeError::none;
}

RuntimeError Runtime::declare_symbol(
    const SymbolKind kind,
    const std::string_view name,
    const std::uint32_t key) {
  const std::string symbol(name);
  auto& table = symbols_.of(kind);
  const auto existing = table.find(symbol);
  if (existing != table.end() && existing->second != key) {
    return RuntimeError::symbol_conflict;
  }
  table[symbol] = key;
  return RuntimeError::none;
}

RuntimeError Runtime::declare_statechart_handler(
    const StatechartHandlerKind kind,
    const std::string_view name,
    const std::uint32_t id) {
  if (id == 0U || name.empty()) return RuntimeError::statechart_invalid;
  auto& handlers = kind == StatechartHandlerKind::guard ? statechart_guards_ : statechart_actions_;
  const auto existing = handlers.find(id);
  if (existing != handlers.end() && existing->second != name) return RuntimeError::statechart_invalid;
  handlers.emplace(id, name);
  return RuntimeError::none;
}

RuntimeError Runtime::install_statechart(
    std::vector<StatechartState> states, std::vector<StatechartTransition> transitions, const std::uint32_t initial) {
  for (const auto& state : states) {
    for (const auto action : state.entry_actions) if (!statechart_actions_.contains(action)) return RuntimeError::statechart_invalid;
    for (const auto action : state.exit_actions) if (!statechart_actions_.contains(action)) return RuntimeError::statechart_invalid;
  }
  for (const auto& transition : transitions) {
    if (transition.guard.has_value() && !statechart_guards_.contains(*transition.guard)) return RuntimeError::statechart_invalid;
    for (const auto action : transition.actions) if (!statechart_actions_.contains(action)) return RuntimeError::statechart_invalid;
  }
  const auto result = statechart_.install(states, transitions, initial);
  if (result == StatechartError::transition_ambiguous || result == StatechartError::invalid_definition) return RuntimeError::statechart_invalid;
  statechart_states_ = std::move(states);
  statechart_transitions_ = std::move(transitions);
  statechart_initial_ = initial;
  replay_initial_state_.statechart = statechart_.snapshot();
  return RuntimeError::none;
}

std::uint32_t Runtime::statechart_active() const noexcept { return statechart_initial_ == 0U ? 0U : statechart_.active(); }

std::string Runtime::timer_name(const std::uint32_t key) const {
  for (const auto& [name, declared] : symbols_.timer) {
    if (declared == key) return name;
  }
  return {};
}

std::int64_t Runtime::integer_state(const std::uint32_t key) const noexcept {
  const auto found = integer_state_.find(key);
  return found == integer_state_.end() ? 0 : found->second;
}

const std::string& Runtime::last_error() const noexcept {
  return lua_.last_error();
}

const std::string& Runtime::last_error_code() const noexcept {
  return lua_.last_error_code();
}

const std::vector<PresentationEvent>& Runtime::presentation_events() const noexcept {
  return presentation_events_;
}

void Runtime::clear_presentation_events() noexcept {
  presentation_events_.clear();
}

const std::vector<StatechartTrace>& Runtime::statechart_traces() const noexcept {
  return statechart_traces_;
}

void Runtime::clear_statechart_traces() noexcept {
  statechart_traces_.clear();
}

std::vector<std::uint8_t> Runtime::save() const {
  return encode_save({tick_, state_hash_, integer_state_, random_streams_.snapshot(), timers_.snapshot(),
      statechart_initial_ == 0U ? std::nullopt : std::optional{statechart_.snapshot()}});
}

RuntimeError Runtime::load_save(const std::span<const std::uint8_t> bytes) {
  if (!pending_inputs_.empty()) {
    return RuntimeError::pending_inputs;
  }
  SavedState decoded{};
  if (!decode_save(bytes, decoded)) {
    return RuntimeError::archive_invalid;
  }
  StatechartRuntime restored_statechart = statechart_;
  if (decoded.statechart.has_value() &&
      (statechart_initial_ == 0U || restored_statechart.restore(*decoded.statechart) != StatechartError::none)) {
    return RuntimeError::statechart_invalid;
  }
  SavedState next_replay_state = decoded;
  tick_ = decoded.tick;
  state_hash_ = decoded.state_hash;
  integer_state_.swap(decoded.integers);
  // A save written before streams existed migrates to the seeded initial set.
  if (decoded.streams.empty()) random_streams_.reset(config_.seed);
  else random_streams_.restore(decoded.streams);
  timers_.restore(decoded.timers);
  if (decoded.statechart.has_value()) statechart_ = std::move(restored_statechart);
  replay_initial_state_ = std::move(next_replay_state);
  replay_frames_.clear();
  commands_.clear();
  presentation_events_.clear();
  statechart_traces_.clear();
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
  verification.symbols_ = symbols_;
  verification.statechart_guards_ = statechart_guards_;
  verification.statechart_actions_ = statechart_actions_;
  if (statechart_initial_ != 0U && verification.install_statechart(statechart_states_, statechart_transitions_, statechart_initial_) != RuntimeError::none) return RuntimeError::statechart_invalid;
  if (!content_pack_source_.empty() &&
      verification.load_content_pack(content_pack_source_) != RuntimeError::none) {
    return RuntimeError::content_pack_invalid;
  }
  if (!gameplay_source_.empty() && verification.load_gameplay(gameplay_source_) != RuntimeError::none) {
    return RuntimeError::script_failure;
  }
  verification.tick_ = decoded.initial_state.tick;
  verification.state_hash_ = decoded.initial_state.state_hash;
  verification.integer_state_ = decoded.initial_state.integers;
  if (decoded.initial_state.streams.empty()) verification.random_streams_.reset(decoded.seed);
  else verification.random_streams_.restore(decoded.initial_state.streams);
  verification.timers_.restore(decoded.initial_state.timers);
  if (decoded.initial_state.statechart.has_value() && verification.statechart_.restore(*decoded.initial_state.statechart) != StatechartError::none) return RuntimeError::replay_mismatch;
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

RuntimeError Runtime::fire_expired_timers() {
  const auto expired = timers_.advance();
  if (expired.empty()) return RuntimeError::none;
  commands_.clear();
  for (const auto key : expired) {
    const auto name = timer_name(key);
    if (name.empty()) continue;
    if (!lua_.on_timer(name, tick_ + 1U, integer_state_, symbols_, timers_, random_streams_, commands_)) {
      commands_.clear();
      return RuntimeError::script_failure;
    }
  }
  const auto result = apply_commands();
  commands_.clear();
  return result;
}

std::optional<bool> Runtime::evaluate_statechart_guard(
    const std::uint32_t guard,
    const StatechartTransition& transition) {
  const auto found = statechart_guards_.find(guard);
  if (found == statechart_guards_.end()) return std::nullopt;
  bool passed = false;
  if (!lua_.statechart_guard(found->second, transition, tick_ + 1U, integer_state_, symbols_, timers_, random_streams_, commands_, passed)) {
    return std::nullopt;
  }
  return passed;
}

RuntimeError Runtime::execute_statechart_result(const StatechartResult& result) {
  if (result.error == StatechartError::guard_evaluation_failed) return RuntimeError::script_failure;
  if (result.error != StatechartError::none) return RuntimeError::statechart_invalid;
  for (const auto& invocation : result.actions) {
    const auto found = statechart_actions_.find(invocation.id);
    if (found == statechart_actions_.end() ||
        !lua_.statechart_action(found->second, invocation, tick_ + 1U, integer_state_, symbols_, timers_, random_streams_, commands_)) {
      return RuntimeError::script_failure;
    }
  }
  if (result.chosen.has_value()) {
    mix_byte(state_hash_, 0xF1U);
    mix_u32(state_hash_, result.chosen->id);
    mix_u32(state_hash_, result.previous);
    mix_u32(state_hash_, result.active);
    for (const auto& guard : result.guards) {
      mix_byte(state_hash_, 0xF2U);
      mix_u32(state_hash_, guard.id);
      mix_byte(state_hash_, guard.passed ? 1U : 0U);
    }
    for (const auto& action : result.actions) {
      mix_byte(state_hash_, 0xF3U);
      mix_u32(state_hash_, action.id);
      mix_byte(state_hash_, static_cast<std::uint8_t>(action.phase));
    }
  }
  return RuntimeError::none;
}

void Runtime::record_statechart_result(const std::uint32_t event, const StatechartResult& result) {
  if (!result.chosen.has_value() && result.guards.empty()) return;
  statechart_traces_.push_back({
      StatechartTraceKind::event, tick_ + 1U, event,
      result.chosen.has_value() ? result.chosen->id : 0U, 0U, 0U,
      result.previous, result.active, false, std::nullopt, result.error});
  for (const auto& guard : result.guards) {
    statechart_traces_.push_back({StatechartTraceKind::guard, tick_ + 1U, event,
        result.chosen.has_value() ? result.chosen->id : 0U, guard.id, 0U,
        result.previous, result.active, guard.passed, std::nullopt, result.error});
  }
  for (const auto& action : result.actions) {
    statechart_traces_.push_back({StatechartTraceKind::action, tick_ + 1U, event,
        action.transition, 0U, action.id, action.previous, action.active, false,
        action.phase, result.error});
  }
}

RuntimeError Runtime::commit_tick() {
  // Timers expire before the inputs of the tick they land on, so a script that
  // both receives an expiry and an input sees them in a declared order.
  const auto timer_result = fire_expired_timers();
  if (timer_result != RuntimeError::none) return timer_result;

  std::sort(pending_inputs_.begin(), pending_inputs_.end(), [](const auto& left, const auto& right) {
    return std::tie(left.sequence, left.action_id, left.value_milli) <
           std::tie(right.sequence, right.action_id, right.value_milli);
  });

  const StatechartRuntime initial_statechart = statechart_;
  const auto initial_trace_count = statechart_traces_.size();
  commands_.clear();
  if (statechart_initial_ != 0U) {
    const auto elapsed = statechart_.advance([this](const auto guard, const auto& transition) {
      return evaluate_statechart_guard(guard, transition);
    });
    if (const auto result = execute_statechart_result(elapsed); result != RuntimeError::none) {
      statechart_ = initial_statechart;
      statechart_traces_.resize(initial_trace_count);
      commands_.clear();
      return result;
    }
    record_statechart_result(0U, elapsed);
  }
  for (const auto& input : pending_inputs_) {
    if (statechart_initial_ != 0U) {
      const auto transition = statechart_.dispatch(input.action_id, [this](const auto guard, const auto& definition) {
        return evaluate_statechart_guard(guard, definition);
      });
      // Inputs outside this chart's declared event vocabulary remain available to
      // gameplay; an explicit chart dispatch still reports event_unhandled.
      if (transition.error != StatechartError::event_unhandled) {
        if (const auto result = execute_statechart_result(transition); result != RuntimeError::none) {
          statechart_ = initial_statechart;
          statechart_traces_.resize(initial_trace_count);
          commands_.clear();
          return result;
        }
      }
      record_statechart_result(input.action_id, transition);
    }
    if (!lua_.on_input(
            {input.action_id, input.value_milli, input.sequence},
            tick_ + 1U,
            integer_state_,
            symbols_,
            timers_,
            random_streams_,
            commands_)) {
      commands_.clear();
      statechart_ = initial_statechart;
      statechart_traces_.resize(initial_trace_count);
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
    statechart_ = initial_statechart;
    statechart_traces_.resize(initial_trace_count);
    throw;
  }
  if (command_result != RuntimeError::none) {
    replay_frames_.pop_back();
    commands_.clear();
    statechart_ = initial_statechart;
    statechart_traces_.resize(initial_trace_count);
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
  for (const auto& timer : timers_.snapshot()) {
    mix_byte(state_hash_, 0xB1U);
    mix_u32(state_hash_, timer.key);
    mix_u64(state_hash_, timer.remaining_ticks);
  }
  for (const auto& stream : random_streams_.snapshot()) {
    mix_byte(state_hash_, 0xD7U);
    mix_u64(state_hash_, random_domain_hash(stream.domain));
    mix_u64(state_hash_, stream.instance);
    mix_u64(state_hash_, stream.state.draws);
  }
  if (statechart_initial_ != 0U) {
    const auto snapshot = statechart_.snapshot();
    mix_byte(state_hash_, 0xF4U);
    mix_u32(state_hash_, snapshot.active);
    mix_u64(state_hash_, snapshot.active_ticks);
    for (const auto& [parent, child] : snapshot.shallow_history) {
      mix_byte(state_hash_, 0xF5U);
      mix_u32(state_hash_, parent);
      mix_u32(state_hash_, child);
    }
  }
  pending_inputs_.clear();
  return RuntimeError::none;
}

RuntimeError Runtime::apply_commands() {
  IntegerState committed = integer_state_;
  LogicalTimerStore committed_timers = timers_;
  auto committed_events = presentation_events_;
  auto committed_sequence = next_presentation_sequence_;
  std::uint64_t committed_hash = state_hash_;
  for (const auto& command : commands_.entries()) {
    switch (command.kind) {
      case CommandKind::add_integer: {
        const auto found = committed.find(command.id);
        const auto current = found == committed.end() ? 0 : found->second;
        // One owner for the overflow rule: saturation is never a result.
        const auto sum = fixed_add(current, command.value);
        if (sum.error != FixedError::none) {
          return RuntimeError::integer_overflow;
        }
        const auto value = sum.value;
        committed[command.id] = value;
        mix_byte(committed_hash, 0xC1U);
        mix_u32(committed_hash, command.id);
        mix_u64(committed_hash, static_cast<std::uint64_t>(value));
        break;
      }
      case CommandKind::start_timer: {
        committed_timers.start(command.id, static_cast<std::uint64_t>(command.value));
        mix_byte(committed_hash, 0xB2U);
        mix_u32(committed_hash, command.id);
        mix_u64(committed_hash, static_cast<std::uint64_t>(command.value));
        break;
      }
      case CommandKind::cancel_timer: {
        // Cancelling a timer that is not running is a no-op, not an error: a rule
        // may cancel defensively without knowing the current state.
        if (committed_timers.cancel(command.id)) {
          mix_byte(committed_hash, 0xB3U);
          mix_u32(committed_hash, command.id);
        }
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
  timers_ = committed_timers;
  presentation_events_.swap(committed_events);
  next_presentation_sequence_ = committed_sequence;
  state_hash_ = committed_hash;
  return RuntimeError::none;
}

}  // namespace ludivra::kernel
