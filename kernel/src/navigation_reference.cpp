#include "navigation_reference.hpp"

#include <algorithm>
#include <limits>
#include <queue>
#include <tuple>

namespace ludivra::kernel {
namespace {

struct FrontierEntry final {
  std::uint32_t score;
  std::uint32_t cost;
  std::uint32_t cell;
};

struct FrontierOrder final {
  bool operator()(const FrontierEntry& left, const FrontierEntry& right) const noexcept {
    return std::tie(left.score, left.cost, left.cell) > std::tie(right.score, right.cost, right.cell);
  }
};

std::uint32_t distance(const NavigationCell left, const NavigationCell right) noexcept {
  const auto dx = left.x >= right.x ? left.x - right.x : right.x - left.x;
  const auto dz = left.z >= right.z ? left.z - right.z : right.z - left.z;
  return static_cast<std::uint32_t>(dx + dz);
}

}  // namespace

bool operator==(const NavigationCell left, const NavigationCell right) noexcept {
  return left.x == right.x && left.z == right.z;
}

bool operator==(const AvoidanceIntent& left, const AvoidanceIntent& right) noexcept {
  return left.agent_id == right.agent_id && left.velocity_x_milli == right.velocity_x_milli &&
      left.velocity_z_milli == right.velocity_z_milli;
}

ReferenceNavigation::ReferenceNavigation(
    const std::int32_t width, const std::int32_t height, std::vector<bool> walkable)
    : width_(width), height_(height), walkable_(std::move(walkable)) {}

bool ReferenceNavigation::in_bounds(const NavigationCell cell) const noexcept {
  return cell.x >= 0 && cell.z >= 0 && cell.x < width_ && cell.z < height_;
}

std::size_t ReferenceNavigation::index(const NavigationCell cell) const noexcept {
  return static_cast<std::size_t>(cell.z) * static_cast<std::size_t>(width_) + static_cast<std::size_t>(cell.x);
}

std::optional<std::uint32_t> ReferenceNavigation::region_for(const NavigationCell cell, const std::uint32_t layers) const {
  for (const auto& [id, region] : regions_) {
    if ((region.layers & layers) != 0U && cell.x >= region.min_x && cell.x <= region.max_x &&
        cell.z >= region.min_z && cell.z <= region.max_z) return id;
  }
  return std::nullopt;
}

bool ReferenceNavigation::traversable(const NavigationCell cell, const std::uint32_t layers) const {
  if (!in_bounds(cell) || !walkable_[index(cell)] || !region_for(cell, layers).has_value()) return false;
  return std::none_of(obstacles_.begin(), obstacles_.end(), [&](const auto& entry) {
    const auto& obstacle = entry.second;
    return obstacle.cell == cell && (obstacle.layers & layers) != 0U;
  });
}

NavigationError ReferenceNavigation::add_region(const NavigationRegion region) {
  if (region.id == 0U || region.layers == 0U || region.min_x < 0 || region.min_z < 0 ||
      region.max_x < region.min_x || region.max_z < region.min_z || region.max_x >= width_ || region.max_z >= height_ ||
      regions_.contains(region.id)) return NavigationError::region_invalid;
  regions_.emplace(region.id, region);
  return NavigationError::none;
}

NavigationError ReferenceNavigation::add_profile(const NavigationAgentProfile profile) {
  if (profile.id == 0U || profile.layers == 0U || profile.max_expanded_nodes == 0U || profiles_.contains(profile.id)) {
    return NavigationError::profile_undeclared;
  }
  profiles_.emplace(profile.id, profile);
  return NavigationError::none;
}

NavigationError ReferenceNavigation::add_link(const NavigationLink link) {
  if (link.id == 0U || link.layers == 0U || link.cost == 0U || links_.contains(link.id) ||
      !in_bounds(link.from) || !in_bounds(link.to)) return NavigationError::region_invalid;
  links_.emplace(link.id, link);
  return NavigationError::none;
}

NavigationError ReferenceNavigation::set_obstacle(const NavigationObstacle obstacle) {
  if (obstacle.id == 0U || obstacle.layers == 0U || !in_bounds(obstacle.cell)) return NavigationError::region_invalid;
  obstacles_.insert_or_assign(obstacle.id, obstacle);
  return NavigationError::none;
}

void ReferenceNavigation::remove_obstacle(const std::uint32_t id) {
  obstacles_.erase(id);
}

NavigationPath ReferenceNavigation::find_path(const NavigationPathQuery& query) const {
  const auto profile = profiles_.find(query.profile_id);
  if (width_ <= 0 || height_ <= 0 || walkable_.size() != static_cast<std::size_t>(width_) * height_) {
    return {NavigationError::map_unavailable, {}, {}, {}, 0U};
  }
  if (profile == profiles_.end()) return {NavigationError::profile_undeclared, {}, {}, {}, 0U};
  const auto layers = query.layers & profile->second.layers;
  if (layers == 0U || !traversable(query.origin, layers) || !traversable(query.destination, layers)) {
    return {NavigationError::region_not_synchronized, {}, {}, {}, 0U};
  }

  const auto cells = static_cast<std::size_t>(width_) * height_;
  const auto unreachable = std::numeric_limits<std::uint32_t>::max();
  std::vector<std::uint32_t> costs(cells, unreachable);
  std::vector<std::uint32_t> parents(cells, unreachable);
  std::vector<std::uint32_t> parent_links(cells, 0U);
  std::priority_queue<FrontierEntry, std::vector<FrontierEntry>, FrontierOrder> frontier;
  const auto origin = static_cast<std::uint32_t>(index(query.origin));
  const auto destination = static_cast<std::uint32_t>(index(query.destination));
  costs[origin] = 0U;
  frontier.push({distance(query.origin, query.destination), 0U, origin});
  std::uint32_t expanded = 0U;
  constexpr NavigationCell steps[] = {{0, -1}, {-1, 0}, {1, 0}, {0, 1}};

  while (!frontier.empty()) {
    const auto current = frontier.top();
    frontier.pop();
    if (current.cost != costs[current.cell]) continue;
    if (++expanded > profile->second.max_expanded_nodes) {
      return {NavigationError::query_budget_exceeded, {}, {}, {}, expanded};
    }
    if (current.cell == destination) break;
    const NavigationCell cell{static_cast<std::int32_t>(current.cell % static_cast<std::uint32_t>(width_)),
        static_cast<std::int32_t>(current.cell / static_cast<std::uint32_t>(width_))};
    std::vector<std::tuple<NavigationCell, std::uint32_t, std::uint32_t>> neighbours;
    for (const auto step : steps) neighbours.emplace_back(NavigationCell{cell.x + step.x, cell.z + step.z}, 1U, 0U);
    for (const auto& [id, link] : links_) {
      if ((link.layers & layers) == 0U) continue;
      if (link.from == cell) neighbours.emplace_back(link.to, link.cost, id);
      if (link.bidirectional && link.to == cell) neighbours.emplace_back(link.from, link.cost, id);
    }
    for (const auto& [next, step_cost, link_id] : neighbours) {
      if (!traversable(next, layers)) continue;
      const auto next_index = static_cast<std::uint32_t>(index(next));
      const auto cost = current.cost + step_cost;
      if (cost >= costs[next_index]) continue;
      costs[next_index] = cost;
      parents[next_index] = current.cell;
      parent_links[next_index] = link_id;
      frontier.push({cost + distance(next, query.destination), cost, next_index});
    }
  }
  if (costs[destination] == unreachable) return {NavigationError::path_not_found, {}, {}, {}, expanded};

  NavigationPath path{NavigationError::none, {}, {}, {}, expanded};
  for (auto current = destination;; current = parents[current]) {
    const NavigationCell cell{static_cast<std::int32_t>(current % static_cast<std::uint32_t>(width_)),
        static_cast<std::int32_t>(current / static_cast<std::uint32_t>(width_))};
    path.cells.push_back(cell);
    const auto region = region_for(cell, layers);
    if (!region.has_value()) return {NavigationError::region_not_synchronized, {}, {}, {}, expanded};
    if (path.region_ids.empty() || path.region_ids.back() != *region) path.region_ids.push_back(*region);
    if (parent_links[current] != 0U) path.link_ids.push_back(parent_links[current]);
    if (current == origin) break;
  }
  std::reverse(path.cells.begin(), path.cells.end());
  std::reverse(path.region_ids.begin(), path.region_ids.end());
  std::reverse(path.link_ids.begin(), path.link_ids.end());
  return path;
}

std::vector<AvoidanceIntent> ReferenceNavigation::avoid(std::vector<AvoidanceAgent> agents) const {
  std::sort(agents.begin(), agents.end(), [](const auto& left, const auto& right) { return left.id < right.id; });
  std::vector<AvoidanceIntent> intents;
  intents.reserve(agents.size());
  for (const auto& agent : agents) {
    auto velocity_x = agent.preferred_x_milli;
    auto velocity_z = agent.preferred_z_milli;
    for (const auto& other : agents) {
      if (agent.id == other.id || (agent.layers & other.layers) == 0U) continue;
      const auto dx = static_cast<std::int64_t>(other.x_milli) - agent.x_milli;
      const auto dz = static_cast<std::int64_t>(other.z_milli) - agent.z_milli;
      const auto radius = static_cast<std::int64_t>(agent.radius_milli) + other.radius_milli;
      if (dx * dx + dz * dz >= radius * radius) continue;
      // Lower id yields to the left, higher id to the right: no random tie break.
      const auto direction = agent.id < other.id ? -1 : 1;
      velocity_x += static_cast<std::int32_t>(direction * (dz == 0 ? radius : dz));
      velocity_z -= static_cast<std::int32_t>(direction * (dx == 0 ? radius : dx));
    }
    intents.push_back({agent.id, velocity_x, velocity_z});
  }
  return intents;
}

}  // namespace ludivra::kernel
