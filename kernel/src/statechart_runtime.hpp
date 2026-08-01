#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <vector>

namespace ludivra::kernel {

enum class StatechartError : std::uint8_t { none, invalid_definition, transition_ambiguous, event_unhandled };
enum class StatechartTransitionKind : std::uint8_t { external, internal };

struct StatechartState final { std::uint32_t id; std::optional<std::uint32_t> parent; bool history; };
struct StatechartTransition final { std::uint32_t id; std::uint32_t from; std::uint32_t event; std::uint32_t to; std::uint32_t priority; StatechartTransitionKind kind; };
struct StatechartSnapshot final { std::uint32_t active; std::vector<std::pair<std::uint32_t, std::uint32_t>> shallow_history; };
struct StatechartResult final { StatechartError error; std::optional<StatechartTransition> chosen; std::uint32_t previous; std::uint32_t active; };

/// One active region. Definitions are immutable after installation; dispatch is
/// ordered by active-depth, explicit priority, then stable transition id.
class StatechartRuntime final {
 public:
  [[nodiscard]] StatechartError install(
      std::vector<StatechartState> states, std::vector<StatechartTransition> transitions, std::uint32_t initial);
  [[nodiscard]] StatechartResult dispatch(std::uint32_t event);
  [[nodiscard]] std::uint32_t active() const noexcept;
  [[nodiscard]] StatechartSnapshot snapshot() const;
  [[nodiscard]] StatechartError restore(const StatechartSnapshot& snapshot);

 private:
  std::map<std::uint32_t, StatechartState> states_;
  std::vector<StatechartTransition> transitions_;
  std::map<std::uint32_t, std::uint32_t> history_;
  std::uint32_t active_{0};
};

}  // namespace ludivra::kernel
