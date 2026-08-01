#include "statechart_runtime.hpp"

#include <algorithm>
#include <set>

namespace ludivra::kernel {

StatechartError StatechartRuntime::install(
    std::vector<StatechartState> states, std::vector<StatechartTransition> transitions, const std::uint32_t initial) {
  std::map<std::uint32_t, StatechartState> next_states;
  for (const auto& state : states) {
    if (!next_states.emplace(state.id, state).second) return StatechartError::invalid_definition;
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
  std::set<std::tuple<std::uint32_t, std::uint32_t, std::uint32_t>> precedence;
  for (const auto& transition : transitions) {
    if (!ids.insert(transition.id).second || !next_states.contains(transition.from) || !next_states.contains(transition.to) ||
        !precedence.insert({transition.from, transition.event, transition.priority}).second) return StatechartError::transition_ambiguous;
  }
  std::sort(transitions.begin(), transitions.end(), [](const auto& left, const auto& right) { return left.id < right.id; });
  states_.swap(next_states); transitions_.swap(transitions); history_.clear(); active_ = initial;
  return StatechartError::none;
}

StatechartResult StatechartRuntime::dispatch(const std::uint32_t event) {
  const auto previous = active_;
  std::optional<StatechartTransition> chosen;
  auto state = std::optional<std::uint32_t>{active_};
  while (state.has_value() && !chosen.has_value()) {
    for (const auto& transition : transitions_) {
      if (transition.from != *state || transition.event != event) continue;
      if (!chosen.has_value() || transition.priority < chosen->priority ||
          (transition.priority == chosen->priority && transition.id < chosen->id)) chosen = transition;
    }
    state = states_.at(*state).parent;
  }
  if (!chosen.has_value()) return {StatechartError::event_unhandled, std::nullopt, previous, active_};
  if (chosen->kind == StatechartTransitionKind::external) {
    const auto parent = states_.at(active_).parent;
    if (parent.has_value() && states_.at(*parent).history) history_[*parent] = active_;
    active_ = chosen->to;
  }
  return {StatechartError::none, chosen, previous, active_};
}

std::uint32_t StatechartRuntime::active() const noexcept { return active_; }
StatechartSnapshot StatechartRuntime::snapshot() const { return {active_, {history_.begin(), history_.end()}}; }
StatechartError StatechartRuntime::restore(const StatechartSnapshot& snapshot) {
  if (!states_.contains(snapshot.active)) return StatechartError::invalid_definition;
  for (const auto& [parent, child] : snapshot.shallow_history) {
    if (!states_.contains(parent) || !states_.contains(child) || !states_.at(parent).history || states_.at(child).parent != parent) return StatechartError::invalid_definition;
  }
  history_ = {snapshot.shallow_history.begin(), snapshot.shallow_history.end()}; active_ = snapshot.active; return StatechartError::none;
}

}  // namespace ludivra::kernel
