#include "logical_timers.hpp"

namespace ludivra::kernel {

void LogicalTimerStore::start(const std::uint32_t key, const std::uint64_t ticks) {
  // Restarting an existing timer replaces its remaining ticks; two timers with the
  // same name would be ambiguous for cancellation and for the hash.
  remaining_[key] = ticks;
}

bool LogicalTimerStore::cancel(const std::uint32_t key) {
  return remaining_.erase(key) > 0;
}

std::optional<std::uint64_t> LogicalTimerStore::remaining(const std::uint32_t key) const {
  const auto found = remaining_.find(key);
  if (found == remaining_.end()) return std::nullopt;
  return found->second;
}

std::vector<std::uint32_t> LogicalTimerStore::advance() {
  std::vector<std::uint32_t> expired;
  for (auto entry = remaining_.begin(); entry != remaining_.end();) {
    if (entry->second <= 1U) {
      expired.push_back(entry->first);
      entry = remaining_.erase(entry);
      continue;
    }
    entry->second -= 1U;
    ++entry;
  }
  return expired;
}

std::vector<LogicalTimer> LogicalTimerStore::snapshot() const {
  std::vector<LogicalTimer> timers;
  timers.reserve(remaining_.size());
  for (const auto& [key, ticks] : remaining_) timers.push_back({key, ticks});
  return timers;
}

void LogicalTimerStore::restore(const std::vector<LogicalTimer>& timers) {
  remaining_.clear();
  for (const auto& timer : timers) remaining_[timer.key] = timer.remaining_ticks;
}

void LogicalTimerStore::clear() noexcept {
  remaining_.clear();
}

}  // namespace ludivra::kernel
