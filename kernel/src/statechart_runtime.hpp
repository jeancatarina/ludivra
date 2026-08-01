#pragma once

#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <vector>

namespace ludivra::kernel {

enum class StatechartError : std::uint8_t { none, invalid_definition, transition_ambiguous, event_unhandled, guard_evaluation_failed };
enum class StatechartTransitionKind : std::uint8_t { external, internal };
enum class StatechartActionPhase : std::uint8_t { exit, transition, entry };

struct StatechartState final {
  std::uint32_t id;
  std::optional<std::uint32_t> parent;
  bool history;
  std::vector<std::uint32_t> entry_actions;
  std::vector<std::uint32_t> exit_actions;
};
struct StatechartTransition final {
  std::uint32_t id;
  std::uint32_t from;
  std::optional<std::uint32_t> event;
  std::optional<std::uint64_t> after_ticks;
  std::uint32_t to;
  std::uint32_t priority;
  StatechartTransitionKind kind;
  std::optional<std::uint32_t> guard;
  std::vector<std::uint32_t> actions;
};
struct StatechartSnapshot final {
  std::uint32_t active;
  std::uint64_t active_ticks;
  std::vector<std::pair<std::uint32_t, std::uint32_t>> shallow_history;
};
struct StatechartGuardEvaluation final { std::uint32_t id; bool passed; };
struct StatechartActionInvocation final {
  std::uint32_t id;
  StatechartActionPhase phase;
  std::uint32_t transition;
  std::uint32_t previous;
  std::uint32_t active;
};
struct StatechartResult final {
  StatechartError error;
  std::optional<StatechartTransition> chosen;
  std::uint32_t previous;
  std::uint32_t active;
  std::vector<StatechartGuardEvaluation> guards;
  std::vector<StatechartActionInvocation> actions;
};
using StatechartGuardEvaluator = std::function<std::optional<bool>(std::uint32_t, const StatechartTransition&)>;

/// One active region. Definitions are immutable after installation; dispatch is
/// ordered by active-depth, explicit priority, then stable transition id.
class StatechartRuntime final {
 public:
  [[nodiscard]] StatechartError install(
      std::vector<StatechartState> states, std::vector<StatechartTransition> transitions, std::uint32_t initial);
  [[nodiscard]] StatechartResult dispatch(std::uint32_t event, const StatechartGuardEvaluator& evaluate = {});
  /// Advances logical statechart time by one committed tick. An elapsed trigger
  /// runs at most once for an active state entry and never reads wall-clock time.
  [[nodiscard]] StatechartResult advance(const StatechartGuardEvaluator& evaluate = {});
  [[nodiscard]] std::uint32_t active() const noexcept;
  [[nodiscard]] StatechartSnapshot snapshot() const;
  [[nodiscard]] StatechartError restore(const StatechartSnapshot& snapshot);

 private:
  std::map<std::uint32_t, StatechartState> states_;
  std::vector<StatechartTransition> transitions_;
  std::map<std::uint32_t, std::uint32_t> history_;
  std::uint32_t active_{0};
  std::uint64_t active_ticks_{0};

  [[nodiscard]] StatechartResult select(
      std::optional<std::uint32_t> event,
      std::optional<std::uint64_t> after_ticks,
      const StatechartGuardEvaluator& evaluate);
  void execute(const StatechartTransition& transition, StatechartResult& result);
  [[nodiscard]] std::uint32_t history_target(std::uint32_t target) const;
};

}  // namespace ludivra::kernel
