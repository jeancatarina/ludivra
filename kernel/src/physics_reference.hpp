#pragma once

#include "regional_world.hpp"

#include <cstdint>
#include <map>
#include <vector>

namespace ludivra::kernel {

enum class PhysicsAuthority : std::uint8_t { presentation, gameplay, host };
enum class PhysicsBodyKind : std::uint8_t { static_body, kinematic, dynamic, trigger };

enum class PhysicsError : std::uint8_t {
  none,
  body_invalid,
  body_duplicate,
  body_unknown,
  authority_mismatch,
  collider_invalid,
  arithmetic_overflow
};

struct PhysicsBox final {
  std::int64_t half_x_milli;
  std::int64_t half_y_milli;
  std::int64_t half_z_milli;
};

struct PhysicsVelocity final {
  std::int64_t x_milli;
  std::int64_t y_milli;
  std::int64_t z_milli;
};

struct PhysicsBodyDefinition final {
  std::uint32_t id;
  PhysicsAuthority authority;
  PhysicsBodyKind kind;
  std::uint32_t layers;
  std::uint32_t mask;
  SpatialGlobalPosition position;
  PhysicsVelocity velocity;
  PhysicsBox box;
};

struct PhysicsContact final {
  std::uint32_t first_id;
  std::uint32_t second_id;
  std::int32_t normal_x_milli;
  std::int32_t normal_y_milli;
  std::int32_t normal_z_milli;
  bool trigger;
};

struct PhysicsBodySnapshot final {
  std::uint32_t id;
  PhysicsAuthority authority;
  PhysicsBodyKind kind;
  SpatialGlobalPosition position;
  PhysicsVelocity velocity;
};

struct PhysicsStep final {
  PhysicsError error;
  std::vector<PhysicsBodySnapshot> committed_bodies;
  std::vector<PhysicsContact> contacts;
};

/**
 * Integer-only physics adapter for boundary tests. It models deterministic box
 * overlap and quantized commit without claiming a production solver.
 */
class ReferencePhysics final {
 public:
  [[nodiscard]] PhysicsError add_body(PhysicsBodyDefinition definition);
  [[nodiscard]] PhysicsError set_velocity(std::uint32_t id, PhysicsVelocity velocity);
  [[nodiscard]] PhysicsStep step();
  [[nodiscard]] std::vector<PhysicsBodySnapshot> inspect() const;
  [[nodiscard]] std::uint64_t gameplay_hash() const noexcept;

 private:
  std::map<std::uint32_t, PhysicsBodyDefinition> bodies_;
  std::vector<PhysicsContact> contacts_;

  [[nodiscard]] static bool collides(const PhysicsBodyDefinition& first, const PhysicsBodyDefinition& second) noexcept;
  [[nodiscard]] static bool collides_by_layer(const PhysicsBodyDefinition& first, const PhysicsBodyDefinition& second) noexcept;
  [[nodiscard]] static PhysicsError integrate(PhysicsBodyDefinition& body) noexcept;
  static void resolve(PhysicsBodyDefinition& first, PhysicsBodyDefinition& second, PhysicsContact& contact) noexcept;
};

}  // namespace ludivra::kernel
