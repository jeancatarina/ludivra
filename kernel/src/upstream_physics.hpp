#pragma once

#include "physics_reference.hpp"

#include <cstdint>
#include <map>
#include <memory>
#include <vector>

namespace ludivra::kernel {

enum class UpstreamPhysicsSolver : std::uint8_t { jolt_3d, box2d_2d };
enum class UpstreamPhysicsAvailability : std::uint8_t { available, not_compiled, target_disabled };

struct UpstreamPhysicsSolverDescriptor final {
  UpstreamPhysicsSolver solver;
  UpstreamPhysicsAvailability availability;
  const char* version;
  const char* commit;
  bool gameplay_authority_available;
};

/**
 * Pinned vendor adapters. The public boundary exposes only Ludivra data: vendor
 * headers and ids stay inside the implementation unit.
 */
class UpstreamPhysicsAdapter final {
 public:
  explicit UpstreamPhysicsAdapter(UpstreamPhysicsSolver solver);
  ~UpstreamPhysicsAdapter();

  UpstreamPhysicsAdapter(const UpstreamPhysicsAdapter&) = delete;
  UpstreamPhysicsAdapter& operator=(const UpstreamPhysicsAdapter&) = delete;
  UpstreamPhysicsAdapter(UpstreamPhysicsAdapter&&) noexcept;
  UpstreamPhysicsAdapter& operator=(UpstreamPhysicsAdapter&&) noexcept;

  [[nodiscard]] UpstreamPhysicsAvailability availability() const noexcept;
  [[nodiscard]] PhysicsError add_body(PhysicsBodyDefinition definition);
  [[nodiscard]] PhysicsError set_velocity(std::uint32_t id, PhysicsVelocity velocity);
  [[nodiscard]] PhysicsError step();
  [[nodiscard]] std::vector<PhysicsBodySnapshot> inspect() const;
  [[nodiscard]] std::vector<PhysicsContact> contacts() const;
  [[nodiscard]] std::uint64_t replay_hash() const noexcept;
  [[nodiscard]] std::vector<std::uint8_t> replay_write() const;
  [[nodiscard]] PhysicsError replay_load(const std::vector<std::uint8_t>& bytes);

 private:
  class Impl;
  struct ReplayBodyAddition final {
    std::uint32_t tick;
    PhysicsBodyDefinition definition;
  };
  struct ReplayVelocityChange final {
    std::uint32_t tick;
    std::uint32_t id;
    PhysicsVelocity velocity;
  };

  UpstreamPhysicsSolver solver_;
  std::unique_ptr<Impl> impl_;
  std::map<std::uint32_t, PhysicsBodyDefinition> definitions_;
  std::vector<PhysicsContact> contacts_;
  std::vector<ReplayBodyAddition> replay_additions_;
  std::vector<ReplayVelocityChange> replay_velocity_changes_;
  std::uint32_t completed_steps_ = 0U;
};

[[nodiscard]] std::vector<UpstreamPhysicsSolverDescriptor> upstream_physics_solvers();

}  // namespace ludivra::kernel
