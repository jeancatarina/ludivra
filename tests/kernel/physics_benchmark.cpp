#include "upstream_physics.hpp"

#include <array>
#include <chrono>
#include <cstdio>
#include <cstdint>

namespace {

using ludivra::kernel::PhysicsAuthority;
using ludivra::kernel::PhysicsBodyDefinition;
using ludivra::kernel::PhysicsBodyKind;
using ludivra::kernel::PhysicsBox;
using ludivra::kernel::PhysicsError;
using ludivra::kernel::PhysicsVelocity;
using ludivra::kernel::SpatialGlobalPosition;
using ludivra::kernel::UpstreamPhysicsAdapter;
using ludivra::kernel::UpstreamPhysicsAvailability;
using ludivra::kernel::UpstreamPhysicsSolver;

constexpr std::uint32_t body_count = 128U;
constexpr std::uint32_t step_count = 600U;

const char* solver_name(const UpstreamPhysicsSolver solver) {
  return solver == UpstreamPhysicsSolver::jolt_3d ? "jolt-3d" : "box2d-2d";
}

std::uint64_t contact_replay_hash(const UpstreamPhysicsSolver solver) {
  UpstreamPhysicsAdapter adapter(solver);
  const std::array<PhysicsBodyDefinition, 3U> bodies{{
      {1U, PhysicsAuthority::gameplay, PhysicsBodyKind::static_body, 1U, 1U, {7U, 0, 0, 0}, {0, 0, 0}, {500, 500, 500}},
      {2U, PhysicsAuthority::gameplay, PhysicsBodyKind::dynamic, 1U, 1U, {7U, 0, 0, 0}, {0, 0, 0}, {500, 500, 500}},
      {3U, PhysicsAuthority::gameplay, PhysicsBodyKind::dynamic, 1U, 1U, {7U, 10'000, 0, 0}, {600, 0, 0}, {500, 500, 500}}
  }};
  for (const PhysicsBodyDefinition& body : bodies) {
    if (adapter.add_body(body) != PhysicsError::none) return 0U;
  }
  return adapter.step() == PhysicsError::none ? adapter.replay_hash() : 0U;
}

int benchmark_solver(const UpstreamPhysicsSolver solver) {
  UpstreamPhysicsAdapter adapter(solver);
  if (adapter.availability() != UpstreamPhysicsAvailability::available) {
    std::fprintf(stderr, "%s is not available for this target\n", solver_name(solver));
    return 2;
  }
  for (std::uint32_t id = 1U; id <= body_count; ++id) {
    const std::uint32_t index = id - 1U;
    const PhysicsBodyDefinition body{id, PhysicsAuthority::presentation, PhysicsBodyKind::dynamic, 1U, 1U,
        SpatialGlobalPosition{7U, static_cast<std::int64_t>(index % 16U) * 4'000,
            0, static_cast<std::int64_t>(index / 16U) * 4'000},
        PhysicsVelocity{0, 0, 0}, PhysicsBox{500, 500, 500}};
    if (adapter.add_body(body) != PhysicsError::none) {
      std::fprintf(stderr, "%s rejected benchmark body %u\n", solver_name(solver), id);
      return 3;
    }
  }

  const auto started = std::chrono::steady_clock::now();
  for (std::uint32_t step = 0U; step < step_count; ++step) {
    if (adapter.step() != PhysicsError::none) {
      std::fprintf(stderr, "%s failed benchmark step %u\n", solver_name(solver), step);
      return 4;
    }
  }
  const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - started);
  std::printf("{\"schemaVersion\":1,\"solver\":\"%s\",\"bodies\":%u,\"steps\":%u,\"elapsedMicroseconds\":%lld,\"contactReplayHash\":\"%016llx\"}\n",
      solver_name(solver), body_count, step_count, static_cast<long long>(elapsed.count()),
      static_cast<unsigned long long>(contact_replay_hash(solver)));
  return 0;
}

}  // namespace

int main() {
  for (const auto solver : std::array{UpstreamPhysicsSolver::jolt_3d, UpstreamPhysicsSolver::box2d_2d}) {
    if (const int result = benchmark_solver(solver); result != 0) return result;
  }
  return 0;
}
