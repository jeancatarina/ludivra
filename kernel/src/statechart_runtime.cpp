#include "statechart_runtime.hpp"

#include <algorithm>
#include <limits>
#include <set>
#include <tuple>

namespace ludivra::kernel {

StatechartError StatechartRuntime::install(
    std::vector<StatechartState> states, std::vector<StatechartTransition> transitions, const std::uint32_t initial) {
  std::map<std::uint32_t, StatechartState> next_states;
  for (auto& state : states) {
    std::sort(state.entry_actions.begin(), state.entry_actions.end());
    std::sort(state.exit_actions.begin(), state.exit_actions.end());
    if (state.id == 0U || !next_states.emplace(state.id, state).second ||
        std::any_of(state.entry_actions.begin(), state.entry_actions.end(), [](const auto id) { return id == 0U; }) ||
        std::any_of(state.exit_actions.begin(), state.exit_actions.end(), [](const auto id) { return id == 0U; }) ||
        std::adjacent_find(state.entry_actions.begin(), state.entry_actions.end()) != state.entry_actions.end() ||
        std::adjacent_find(state.exit_actions.begin(), state.exit_actions.end()) != state.exit_actions.end()) {
      return StatechartError::invalid_definition;
    }
  }
  if (!next_states.contains(initial)) return StatechartError::invalid_definition;
  for (const auto& [id, state] : next_states) {
    std::set<std::uint32_t> ancestors;
    auto current = state.parent;
    while (current.has_value()) {
      if (!next_states.contains(*current) || !ancestors.insert(*current).second || *current == id) return StatechartError::invalid_definition;
      current = next_states.at(*current).parent;
    }
  }
  std::set<std::uint32_t> ids;
  std::set<std::tuple<std::uint32_t, bool, std::uint64_t, std::uint32_t>> precedence;
  for (auto& transition : transitions) {
    std::sort(transition.actions.begin(), transition.actions.end());
    if (transition.id == 0U || !ids.insert(transition.id).second || !next_states.contains(transition.from) || !next_states.contains(transition.to) ||
        (transition.event.has_value() == transition.after_ticks.has_value()) ||
        (transition.event.has_value() && *transition.event == 0U) ||
        (transition.after_ticks.has_value() && *transition.after_ticks == 0U) ||
        (transition.guard.has_value() && *transition.guard == 0U) ||
        std::any_of(transition.actions.begin(), transition.actions.end(), [](const auto id) { return id == 0U; }) ||
        std::adjacent_find(transition.actions.begin(), transition.actions.end()) != transition.actions.end()) {
      return StatechartError::invalid_definition;
    }
    const auto trigger = transition.event.has_value() ? static_cast<std::uint64_t>(*transition.event) : *transition.after_ticks;
    if (!precedence.insert({transition.from, transition.event.has_value(), trigger, transition.priority}).second) {
      return StatechartError::transition_ambiguous;
    }
  }
  std::sort(transitions.begin(), transitions.end(), [](const auto& left, const auto& right) { return left.id < right.id; });
  states_.swap(next_states); transitions_.swap(transitions); history_.clear(); active_ = initial; active_ticks_ = 0U;
  return StatechartError::none;
}

StatechartResult StatechartRuntime::dispatch(const std::uint32_t event, const StatechartGuardEvaluator& evaluate) {
  if (event == 0U) return {StatechartError::invalid_definition, std::nullopt, active_, active_, {}, {}};
  return select(event, std::nullopt, evaluate);
}

StatechartResult StatechartRuntime::advance(const StatechartGuardEvaluator& evaluate) {
  if (active_ == 0U || active_ticks_ == std::numeric_limits<std::uint64_t>::max()) {
    return {StatechartError::invalid_definition, std::nullopt, active_, active_, {}, {}};
  }
  ++active_ticks_;
  return select(std::nullopt, active_ticks_, evaluate);
}

StatechartResult StatechartRuntime::select(
    const std::optional<std::uint32_t> event,
    const std::optional<std::uint64_t> after_ticks,
    const StatechartGuardEvaluator& evaluate) {
  const auto previous = active_;
  StatechartResult result{StatechartError::none, std::nullopt, previous, active_, {}, {}};
  auto state = std::optional<std::uint32_t>{active_};
  while (state.has_value() && !result.chosen.has_value()) {
    std::vector<const StatechartTransition*> candidates;
    for (const auto& transition : transitions_) {
      if (transition.from == *state && transition.event == event && transition.after_ticks == after_ticks) {
        candidates.push_back(&transition);
      }
    }
    std::sort(candidates.begin(), candidates.end(), [](const auto* left, const auto* right) {
      return std::tie(left->priority, left->id) < std::tie(right->priority, right->id);
    });
    for (const auto* candidate : candidates) {
      const auto& transition = *candidate;
      if (transition.guard.has_value()) {
        if (!evaluate) {
          result.error = StatechartError::guard_evaluation_failed;
          return result;
        }
        const auto passed = evaluate(*transition.guard, transition);
        if (!passed.has_value()) {
          result.error = StatechartError::guard_evaluation_failed;
          return result;
        }
        result.guards.push_back({*transition.guard, *passed});
        if (!*passed) continue;
      }
      result.chosen = transition;
      break;
    }
    state = states_.at(*state).parent;
  }
  if (!result.chosen.has_value()) {
    result.error = event.has_value() ? StatechartError::event_unhandled : StatechartError::none;
    return result;
  }
  execute(*result.chosen, result);
  result.active = active_;
  return result;
}

std::uint32_t StatechartRuntime::history_target(std::uint32_t target) const {
  std::set<std::uint32_t> visited;
  while (states_.at(target).history) {
    const auto remembered = history_.find(target);
    if (remembered == history_.end() || !visited.insert(target).second) break;
    target = remembered->second;
  }
  return target;
}

void StatechartRuntime::execute(const StatechartTransition& transition, StatechartResult& result) {
  const auto append_actions = [&](const std::vector<std::uint32_t>& actions, const StatechartActionPhase phase) {
    for (const auto action : actions) result.actions.push_back({action, phase, transition.id, result.previous, 0U});
  };
  if (transition.kind == StatechartTransitionKind::internal) {
    append_actions(transition.actions, StatechartActionPhase::transition);
    for (auto& action : result.actions) action.active = active_;
    return;
  }

  const auto target = history_target(transition.to);
  std::vector<std::uint32_t> source_path;
  std::vector<std::uint32_t> target_path;
  for (auto current = std::optional<std::uint32_t>{active_}; current.has_value(); current = states_.at(*current).parent) source_path.push_back(*current);
  for (auto current = std::optional<std::uint32_t>{target}; current.has_value(); current = states_.at(*current).parent) target_path.push_back(*current);
  std::optional<std::uint32_t> shared;
  for (const auto source : source_path) {
    if (std::find(target_path.begin(), target_path.end(), source) != target_path.end()) { shared = source; break; }
  }
  // An external transition out of its own source is a re-entry, so that source
  // is not shared for lifecycle purposes.
  if (shared == std::optional{transition.from}) shared = states_.at(*shared).parent;

  for (const auto source : source_path) {
    if (shared == std::optional{source}) break;
    append_actions(states_.at(source).exit_actions, StatechartActionPhase::exit);
    const auto parent = states_.at(source).parent;
    if (parent.has_value() && states_.at(*parent).history) history_[*parent] = source;
  }
  append_actions(transition.actions, StatechartActionPhase::transition);
  std::vector<std::uint32_t> entry_path;
  for (const auto candidate : target_path) {
    if (shared == std::optional{candidate}) break;
    entry_path.push_back(candidate);
  }
  for (auto entry = entry_path.rbegin(); entry != entry_path.rend(); ++entry) {
    append_actions(states_.at(*entry).entry_actions, StatechartActionPhase::entry);
  }
  active_ = target;
  active_ticks_ = 0U;
  for (auto& action : result.actions) action.active = active_;
}

std::uint32_t StatechartRuntime::active() const noexcept { return active_; }
StatechartSnapshot StatechartRuntime::snapshot() const { return {active_, active_ticks_, {history_.begin(), history_.end()}}; }
StatechartError StatechartRuntime::restore(const StatechartSnapshot& snapshot) {
  if (!states_.contains(snapshot.active)) return StatechartError::invalid_definition;
  for (const auto& [parent, child] : snapshot.shallow_history) {
    if (!states_.contains(parent) || !states_.contains(child) || !states_.at(parent).history || states_.at(child).parent != parent) return StatechartError::invalid_definition;
  }
  history_ = {snapshot.shallow_history.begin(), snapshot.shallow_history.end()}; active_ = snapshot.active; active_ticks_ = snapshot.active_ticks; return StatechartError::none;
}

}  // namespace ludivra::kernel
