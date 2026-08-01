#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <vector>

namespace ludivra::kernel {

struct NavigationCell final {
  std::int32_t x;
  std::int32_t z;
};

[[nodiscard]] bool operator==(NavigationCell left, NavigationCell right) noexcept;

struct NavigationRegion final {
  std::uint32_t id;
  std::int32_t min_x;
  std::int32_t min_z;
  std::int32_t max_x;
  std::int32_t max_z;
  std::uint32_t layers;
};

struct NavigationAgentProfile final {
  std::uint32_t id;
  std::uint32_t layers;
  std::uint32_t max_expanded_nodes;
};

struct NavigationLink final {
  std::uint32_t id;
  NavigationCell from;
  NavigationCell to;
  std::uint32_t layers;
  std::uint32_t cost;
  bool bidirectional;
};

struct NavigationObstacle final {
  std::uint32_t id;
  NavigationCell cell;
  std::uint32_t layers;
};

enum class NavigationError : std::uint8_t {
  none,
  map_unavailable,
  region_invalid,
  profile_undeclared,
  path_not_found,
  query_budget_exceeded,
  region_not_synchronized
};

struct NavigationPathQuery final {
  std::uint32_t profile_id;
  std::uint32_t layers;
  NavigationCell origin;
  NavigationCell destination;
};

struct NavigationPath final {
  NavigationError error;
  std::vector<NavigationCell> cells;
  std::vector<std::uint32_t> region_ids;
  std::vector<std::uint32_t> link_ids;
  std::uint32_t expanded_nodes;
};

struct AvoidanceAgent final {
  std::uint32_t id;
  std::int32_t x_milli;
  std::int32_t z_milli;
  std::int32_t preferred_x_milli;
  std::int32_t preferred_z_milli;
  std::uint32_t radius_milli;
  std::uint32_t layers;
};

struct AvoidanceIntent final {
  std::uint32_t agent_id;
  std::int32_t velocity_x_milli;
  std::int32_t velocity_z_milli;
};

[[nodiscard]] bool operator==(const AvoidanceIntent& left, const AvoidanceIntent& right) noexcept;

/**
 * Deterministic reference adapter for closed fixtures. It establishes contract
 * and inspection behavior; it is deliberately not a production navmesh backend.
 */
class ReferenceNavigation final {
 public:
  ReferenceNavigation(std::int32_t width, std::int32_t height, std::vector<bool> walkable);

  [[nodiscard]] NavigationError add_region(NavigationRegion region);
  [[nodiscard]] NavigationError add_profile(NavigationAgentProfile profile);
  [[nodiscard]] NavigationError add_link(NavigationLink link);
  [[nodiscard]] NavigationError set_obstacle(NavigationObstacle obstacle);
  void remove_obstacle(std::uint32_t id);

  [[nodiscard]] NavigationPath find_path(const NavigationPathQuery& query) const;
  [[nodiscard]] std::vector<AvoidanceIntent> avoid(std::vector<AvoidanceAgent> agents) const;

 private:
  std::int32_t width_;
  std::int32_t height_;
  std::vector<bool> walkable_;
  std::map<std::uint32_t, NavigationRegion> regions_;
  std::map<std::uint32_t, NavigationAgentProfile> profiles_;
  std::map<std::uint32_t, NavigationLink> links_;
  std::map<std::uint32_t, NavigationObstacle> obstacles_;

  [[nodiscard]] bool in_bounds(NavigationCell cell) const noexcept;
  [[nodiscard]] std::size_t index(NavigationCell cell) const noexcept;
  [[nodiscard]] bool traversable(NavigationCell cell, std::uint32_t layers) const;
  [[nodiscard]] std::optional<std::uint32_t> region_for(NavigationCell cell, std::uint32_t layers) const;
};

}  // namespace ludivra::kernel
