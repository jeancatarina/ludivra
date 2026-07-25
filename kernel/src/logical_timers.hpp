#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <vector>

namespace ludivra::kernel {

/// One timer as it travels through save, replay and hash.
struct LogicalTimer final {
  std::uint32_t key;
  std::uint64_t remaining_ticks;
};

/**
 * Timers measured in logical ticks, never in wall clock. Ordering is by key, so
 * two timers expiring on the same tick always fire in the same order, on every
 * machine and in every replay.
 */
class LogicalTimerStore final {
 public:
  void start(std::uint32_t key, std::uint64_t ticks);
  bool cancel(std::uint32_t key);
  [[nodiscard]] std::optional<std::uint64_t> remaining(std::uint32_t key) const;

  /// Advances every timer by one tick and returns the keys that expired, ordered.
  [[nodiscard]] std::vector<std::uint32_t> advance();

  [[nodiscard]] std::vector<LogicalTimer> snapshot() const;
  void restore(const std::vector<LogicalTimer>& timers);
  void clear() noexcept;

 private:
  std::map<std::uint32_t, std::uint64_t> remaining_;
};

}  // namespace ludivra::kernel
