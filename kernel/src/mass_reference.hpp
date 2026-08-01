#pragma once

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

enum class MassLevel : std::uint8_t { full_entity, simplified_agent, aggregate_group, visual_instance, density };
enum class MassError : std::uint8_t { none, agent_invalid, agent_duplicate, agent_unknown, budget_exceeded, query_too_broad, arithmetic_overflow };

struct MassBudget final {
  std::uint32_t full_entities;
  std::uint32_t simplified_agents;
  std::uint32_t aggregate_groups;
  std::int64_t maximum_query_radius_milli;
  std::uint32_t maximum_query_results;
};

struct MassAgent final {
  std::uint32_t id;
  MassLevel level;
  std::int64_t x_milli;
  std::int64_t z_milli;
  std::int64_t velocity_x_milli;
  std::int64_t velocity_z_milli;
  std::int32_t health;
};

struct MassInspection final {
  std::uint32_t full_entities;
  std::uint32_t simplified_agents;
  std::uint32_t aggregate_groups;
  std::uint32_t visual_instances;
  std::uint32_t densities;
  std::vector<MassAgent> agents;
};

/** SoA reference Mass runtime; order is canonical by semantic agent id. */
class ReferenceMass final {
 public:
  explicit ReferenceMass(MassBudget budget);

  [[nodiscard]] MassError add(MassAgent agent);
  [[nodiscard]] MassError set_level(std::uint32_t id, MassLevel level);
  [[nodiscard]] MassError advance();
  [[nodiscard]] MassError damage_disc(std::int64_t x_milli, std::int64_t z_milli, std::int64_t radius_milli, std::int32_t damage, std::uint32_t max_results);
  [[nodiscard]] MassError query_disc(std::int64_t x_milli, std::int64_t z_milli, std::int64_t radius_milli, std::uint32_t max_results, std::vector<std::uint32_t>& out) const;
  [[nodiscard]] MassInspection inspect() const;
  [[nodiscard]] std::uint64_t authoritative_hash() const noexcept;

 private:
  MassBudget budget_;
  std::vector<std::uint32_t> ids_;
  std::vector<MassLevel> levels_;
  std::vector<std::int64_t> xs_;
  std::vector<std::int64_t> zs_;
  std::vector<std::int64_t> velocity_xs_;
  std::vector<std::int64_t> velocity_zs_;
  std::vector<std::int32_t> healths_;

  [[nodiscard]] std::size_t lower_bound(std::uint32_t id) const noexcept;
  [[nodiscard]] bool within_budget(MassLevel level, std::size_t except = static_cast<std::size_t>(-1)) const noexcept;
  [[nodiscard]] MassAgent at(std::size_t index) const noexcept;
};

}  // namespace ludivra::kernel
