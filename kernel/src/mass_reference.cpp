#include "mass_reference.hpp"

#include "fixed_point.hpp"

#include <algorithm>
#include <limits>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_offset = 14695981039346656037ULL;
constexpr std::uint64_t fnv_prime = 1099511628211ULL;
constexpr std::int64_t maximum_squared_radius_milli = 1'000'000'000LL;

bool authoritative(const MassLevel level) noexcept {
  return level == MassLevel::full_entity || level == MassLevel::simplified_agent || level == MassLevel::aggregate_group;
}

void mix_byte(std::uint64_t& hash, const std::uint8_t value) noexcept { hash ^= value; hash *= fnv_prime; }
void mix_u32(std::uint64_t& hash, const std::uint32_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 32U; shift += 8U) mix_byte(hash, static_cast<std::uint8_t>(value >> shift));
}
void mix_u64(std::uint64_t& hash, const std::uint64_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 64U; shift += 8U) mix_byte(hash, static_cast<std::uint8_t>(value >> shift));
}

std::uint64_t distance(const std::int64_t left, const std::int64_t right) noexcept {
  return left >= right ? static_cast<std::uint64_t>(left) - static_cast<std::uint64_t>(right)
                       : static_cast<std::uint64_t>(right) - static_cast<std::uint64_t>(left);
}

}  // namespace

ReferenceMass::ReferenceMass(const MassBudget budget) : budget_(budget) {}

std::size_t ReferenceMass::lower_bound(const std::uint32_t id) const noexcept {
  return static_cast<std::size_t>(std::lower_bound(ids_.begin(), ids_.end(), id) - ids_.begin());
}

MassAgent ReferenceMass::at(const std::size_t index) const noexcept {
  return {ids_[index], levels_[index], xs_[index], zs_[index], velocity_xs_[index], velocity_zs_[index], healths_[index]};
}

bool ReferenceMass::within_budget(const MassLevel level, const std::size_t except) const noexcept {
  std::uint32_t count = 0U;
  for (std::size_t index = 0; index < levels_.size(); ++index) if (index != except && levels_[index] == level) ++count;
  const std::uint32_t budget = level == MassLevel::full_entity ? budget_.full_entities :
      level == MassLevel::simplified_agent ? budget_.simplified_agents :
      level == MassLevel::aggregate_group ? budget_.aggregate_groups : std::numeric_limits<std::uint32_t>::max();
  return count < budget;
}

MassError ReferenceMass::add(const MassAgent agent) {
  if (agent.id == 0U) return MassError::agent_invalid;
  const auto index = lower_bound(agent.id);
  if (index < ids_.size() && ids_[index] == agent.id) return MassError::agent_duplicate;
  if (!within_budget(agent.level)) return MassError::budget_exceeded;
  ids_.insert(ids_.begin() + static_cast<std::ptrdiff_t>(index), agent.id);
  levels_.insert(levels_.begin() + static_cast<std::ptrdiff_t>(index), agent.level);
  xs_.insert(xs_.begin() + static_cast<std::ptrdiff_t>(index), agent.x_milli);
  zs_.insert(zs_.begin() + static_cast<std::ptrdiff_t>(index), agent.z_milli);
  velocity_xs_.insert(velocity_xs_.begin() + static_cast<std::ptrdiff_t>(index), agent.velocity_x_milli);
  velocity_zs_.insert(velocity_zs_.begin() + static_cast<std::ptrdiff_t>(index), agent.velocity_z_milli);
  healths_.insert(healths_.begin() + static_cast<std::ptrdiff_t>(index), agent.health);
  return MassError::none;
}

MassError ReferenceMass::set_level(const std::uint32_t id, const MassLevel level) {
  const auto index = lower_bound(id);
  if (index == ids_.size() || ids_[index] != id) return MassError::agent_unknown;
  if (levels_[index] == level) return MassError::none;
  if (!within_budget(level, index)) return MassError::budget_exceeded;
  levels_[index] = level;
  return MassError::none;
}

MassError ReferenceMass::advance() {
  for (std::size_t index = 0; index < ids_.size(); ++index) {
    if (!authoritative(levels_[index])) continue;
    const auto x = fixed_add(xs_[index], velocity_xs_[index]);
    const auto z = fixed_add(zs_[index], velocity_zs_[index]);
    if (x.error != FixedError::none || z.error != FixedError::none) return MassError::arithmetic_overflow;
    xs_[index] = x.value;
    zs_[index] = z.value;
  }
  return MassError::none;
}

MassError ReferenceMass::query_disc(
    const std::int64_t x_milli, const std::int64_t z_milli, const std::int64_t radius_milli,
    const std::uint32_t max_results, std::vector<std::uint32_t>& out) const {
  out.clear();
  if (radius_milli < 0 || radius_milli > maximum_squared_radius_milli || radius_milli > budget_.maximum_query_radius_milli ||
      max_results == 0U || max_results > budget_.maximum_query_results) {
    return MassError::query_too_broad;
  }
  const auto radius = static_cast<std::uint64_t>(radius_milli);
  const auto radius_squared = radius * radius;
  for (std::size_t index = 0; index < ids_.size(); ++index) {
    if (!authoritative(levels_[index])) continue;
    const auto dx = distance(xs_[index], x_milli);
    const auto dz = distance(zs_[index], z_milli);
    if (dx > radius || dz > radius) continue;
    if (dx * dx + dz * dz > radius_squared) continue;
    if (out.size() >= max_results) return MassError::query_too_broad;
    out.push_back(ids_[index]);
  }
  return MassError::none;
}

MassError ReferenceMass::damage_disc(
    const std::int64_t x_milli, const std::int64_t z_milli, const std::int64_t radius_milli,
    const std::int32_t damage, const std::uint32_t max_results) {
  std::vector<std::uint32_t> matches;
  if (const auto error = query_disc(x_milli, z_milli, radius_milli, max_results, matches); error != MassError::none) return error;
  for (const auto id : matches) {
    const auto index = lower_bound(id);
    if (damage > 0 && healths_[index] < std::numeric_limits<std::int32_t>::min() + damage) return MassError::arithmetic_overflow;
    if (damage < 0 && healths_[index] > std::numeric_limits<std::int32_t>::max() + damage) return MassError::arithmetic_overflow;
    healths_[index] -= damage;
  }
  return MassError::none;
}

MassInspection ReferenceMass::inspect() const {
  MassInspection inspection{0U, 0U, 0U, 0U, 0U, {}};
  inspection.agents.reserve(ids_.size());
  for (std::size_t index = 0; index < ids_.size(); ++index) {
    inspection.agents.push_back(at(index));
    if (levels_[index] == MassLevel::full_entity) ++inspection.full_entities;
    else if (levels_[index] == MassLevel::simplified_agent) ++inspection.simplified_agents;
    else if (levels_[index] == MassLevel::aggregate_group) ++inspection.aggregate_groups;
    else if (levels_[index] == MassLevel::visual_instance) ++inspection.visual_instances;
    else ++inspection.densities;
  }
  return inspection;
}

std::uint64_t ReferenceMass::authoritative_hash() const noexcept {
  std::uint64_t hash = fnv_offset;
  for (std::size_t index = 0; index < ids_.size(); ++index) {
    if (!authoritative(levels_[index])) continue;
    mix_u32(hash, ids_[index]); mix_byte(hash, static_cast<std::uint8_t>(levels_[index]));
    mix_u64(hash, static_cast<std::uint64_t>(xs_[index])); mix_u64(hash, static_cast<std::uint64_t>(zs_[index]));
    mix_u64(hash, static_cast<std::uint64_t>(velocity_xs_[index])); mix_u64(hash, static_cast<std::uint64_t>(velocity_zs_[index]));
    mix_u32(hash, static_cast<std::uint32_t>(healths_[index]));
  }
  return hash;
}

}  // namespace ludivra::kernel
