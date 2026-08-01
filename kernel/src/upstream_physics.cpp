#include "upstream_physics.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <utility>

#if LUDIVRA_HAS_JOLT_PHYSICS
#include <Jolt/Jolt.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/JobSystemSingleThreaded.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Body/Body.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/PhysicsSystem.h>
#include <Jolt/RegisterTypes.h>
#endif

#if LUDIVRA_HAS_BOX2D_PHYSICS
#include <box2d/box2d.h>
#endif

namespace ludivra::kernel {
namespace {

bool has_valid_box(const PhysicsBodyDefinition& definition) noexcept {
  return definition.id != 0U && definition.layers != 0U && definition.mask != 0U &&
      definition.box.half_x_milli > 0 && definition.box.half_y_milli > 0 && definition.box.half_z_milli > 0;
}

#if LUDIVRA_HAS_JOLT_PHYSICS || LUDIVRA_HAS_BOX2D_PHYSICS
constexpr double milli_per_meter = 1'000.0;
constexpr float simulation_step_seconds = 1.0F / 60.0F;

double meters(const std::int64_t value) noexcept {
  return static_cast<double>(value) / milli_per_meter;
}

bool quantize(const double value, std::int64_t& output) noexcept {
  const double scaled = std::round(value * milli_per_meter);
  if (scaled < static_cast<double>(std::numeric_limits<std::int64_t>::min()) ||
      scaled > static_cast<double>(std::numeric_limits<std::int64_t>::max())) {
    return false;
  }
  output = static_cast<std::int64_t>(scaled);
  return true;
}

PhysicsError snapshot_from_values(PhysicsBodyDefinition& definition, const double x, const double y, const double z,
    const double velocity_x, const double velocity_y, const double velocity_z) noexcept {
  if (!quantize(x, definition.position.x_milli) || !quantize(y, definition.position.y_milli) ||
      !quantize(z, definition.position.z_milli) || !quantize(velocity_x, definition.velocity.x_milli) ||
      !quantize(velocity_y, definition.velocity.y_milli) || !quantize(velocity_z, definition.velocity.z_milli)) {
    return PhysicsError::arithmetic_overflow;
  }
  return PhysicsError::none;
}

std::int32_t quantize_normal(const double value) noexcept {
  return static_cast<std::int32_t>(std::round(value * milli_per_meter));
}

void canonicalize_contacts(std::vector<PhysicsContact>& contacts) {
  std::sort(contacts.begin(), contacts.end(), [](const PhysicsContact& first, const PhysicsContact& second) {
    if (first.first_id != second.first_id) return first.first_id < second.first_id;
    if (first.second_id != second.second_id) return first.second_id < second.second_id;
    if (first.normal_x_milli != second.normal_x_milli) return first.normal_x_milli < second.normal_x_milli;
    if (first.normal_y_milli != second.normal_y_milli) return first.normal_y_milli < second.normal_y_milli;
    if (first.normal_z_milli != second.normal_z_milli) return first.normal_z_milli < second.normal_z_milli;
    return first.trigger < second.trigger;
  });
  contacts.erase(std::unique(contacts.begin(), contacts.end(), [](const PhysicsContact& first, const PhysicsContact& second) {
    return first.first_id == second.first_id && first.second_id == second.second_id &&
        first.normal_x_milli == second.normal_x_milli && first.normal_y_milli == second.normal_y_milli &&
        first.normal_z_milli == second.normal_z_milli && first.trigger == second.trigger;
  }), contacts.end());
}
#endif

constexpr std::uint32_t replay_magic = 0x4c505531U;
constexpr std::uint32_t replay_version = 2U;
constexpr std::uint32_t maximum_replay_bodies = 256U;
constexpr std::uint32_t maximum_replay_velocity_changes = 4'096U;
constexpr std::uint64_t fnv_offset = 14695981039346656037ULL;
constexpr std::uint64_t fnv_prime = 1099511628211ULL;

void mix_byte(std::uint64_t& hash, const std::uint8_t value) noexcept {
  hash ^= value;
  hash *= fnv_prime;
}

void mix_u32(std::uint64_t& hash, const std::uint32_t value) noexcept {
  for (std::uint32_t shift = 0U; shift < 32U; shift += 8U) mix_byte(hash, static_cast<std::uint8_t>(value >> shift));
}

void mix_i64(std::uint64_t& hash, const std::int64_t value) noexcept {
  const std::uint64_t unsigned_value = static_cast<std::uint64_t>(value);
  for (std::uint32_t shift = 0U; shift < 64U; shift += 8U) mix_byte(hash, static_cast<std::uint8_t>(unsigned_value >> shift));
}

void write_u8(std::vector<std::uint8_t>& bytes, const std::uint8_t value) {
  bytes.push_back(value);
}

void write_u32(std::vector<std::uint8_t>& bytes, const std::uint32_t value) {
  for (std::uint32_t shift = 0U; shift < 32U; shift += 8U) write_u8(bytes, static_cast<std::uint8_t>(value >> shift));
}

void write_i64(std::vector<std::uint8_t>& bytes, const std::int64_t value) {
  const std::uint64_t unsigned_value = static_cast<std::uint64_t>(value);
  for (std::uint32_t shift = 0U; shift < 64U; shift += 8U) write_u8(bytes, static_cast<std::uint8_t>(unsigned_value >> shift));
}

class ReplayReader final {
 public:
  explicit ReplayReader(const std::vector<std::uint8_t>& bytes) : bytes_(bytes) {}

  [[nodiscard]] bool read_u8(std::uint8_t& value) {
    if (cursor_ >= bytes_.size()) return false;
    value = bytes_[cursor_++];
    return true;
  }

  [[nodiscard]] bool read_u32(std::uint32_t& value) {
    value = 0U;
    for (std::uint32_t shift = 0U; shift < 32U; shift += 8U) {
      std::uint8_t byte = 0U;
      if (!read_u8(byte)) return false;
      value |= static_cast<std::uint32_t>(byte) << shift;
    }
    return true;
  }

  [[nodiscard]] bool read_i64(std::int64_t& value) {
    std::uint64_t unsigned_value = 0U;
    for (std::uint32_t shift = 0U; shift < 64U; shift += 8U) {
      std::uint8_t byte = 0U;
      if (!read_u8(byte)) return false;
      unsigned_value |= static_cast<std::uint64_t>(byte) << shift;
    }
    value = static_cast<std::int64_t>(unsigned_value);
    return true;
  }

  [[nodiscard]] bool done() const noexcept { return cursor_ == bytes_.size(); }

 private:
  const std::vector<std::uint8_t>& bytes_;
  std::size_t cursor_ = 0U;
};

void write_body(std::vector<std::uint8_t>& bytes, const PhysicsBodyDefinition& definition) {
  write_u32(bytes, definition.id);
  write_u8(bytes, static_cast<std::uint8_t>(definition.authority));
  write_u8(bytes, static_cast<std::uint8_t>(definition.kind));
  write_u32(bytes, definition.layers);
  write_u32(bytes, definition.mask);
  write_u32(bytes, definition.position.dimension);
  write_i64(bytes, definition.position.x_milli);
  write_i64(bytes, definition.position.y_milli);
  write_i64(bytes, definition.position.z_milli);
  write_i64(bytes, definition.velocity.x_milli);
  write_i64(bytes, definition.velocity.y_milli);
  write_i64(bytes, definition.velocity.z_milli);
  write_i64(bytes, definition.box.half_x_milli);
  write_i64(bytes, definition.box.half_y_milli);
  write_i64(bytes, definition.box.half_z_milli);
}

void write_velocity(std::vector<std::uint8_t>& bytes, const PhysicsVelocity velocity) {
  write_i64(bytes, velocity.x_milli);
  write_i64(bytes, velocity.y_milli);
  write_i64(bytes, velocity.z_milli);
}

bool read_velocity(ReplayReader& reader, PhysicsVelocity& velocity) {
  return reader.read_i64(velocity.x_milli) && reader.read_i64(velocity.y_milli) && reader.read_i64(velocity.z_milli);
}

bool read_body(ReplayReader& reader, PhysicsBodyDefinition& definition) {
  std::uint8_t authority = 0U;
  std::uint8_t kind = 0U;
  std::uint32_t dimension = 0U;
  const bool decoded = reader.read_u32(definition.id) && reader.read_u8(authority) && reader.read_u8(kind) &&
      reader.read_u32(definition.layers) && reader.read_u32(definition.mask) && reader.read_u32(dimension) &&
      reader.read_i64(definition.position.x_milli) && reader.read_i64(definition.position.y_milli) &&
      reader.read_i64(definition.position.z_milli) && reader.read_i64(definition.velocity.x_milli) &&
      reader.read_i64(definition.velocity.y_milli) && reader.read_i64(definition.velocity.z_milli) &&
      reader.read_i64(definition.box.half_x_milli) && reader.read_i64(definition.box.half_y_milli) &&
      reader.read_i64(definition.box.half_z_milli);
  if (!decoded || dimension > std::numeric_limits<std::uint16_t>::max() || authority > static_cast<std::uint8_t>(PhysicsAuthority::host) ||
      kind > static_cast<std::uint8_t>(PhysicsBodyKind::trigger)) {
    return false;
  }
  definition.authority = static_cast<PhysicsAuthority>(authority);
  definition.kind = static_cast<PhysicsBodyKind>(kind);
  definition.position.dimension = static_cast<std::uint16_t>(dimension);
  return true;
}

#if LUDIVRA_HAS_JOLT_PHYSICS
namespace jolt_layers {
constexpr JPH::ObjectLayer static_body = 0;
constexpr JPH::ObjectLayer moving_body = 1;

constexpr JPH::BroadPhaseLayer static_broad_phase{0};
constexpr JPH::BroadPhaseLayer moving_broad_phase{1};
constexpr JPH::uint broad_phase_count = 2;
}  // namespace jolt_layers

class JoltObjectLayerPairFilter final : public JPH::ObjectLayerPairFilter {
 public:
  [[nodiscard]] bool ShouldCollide(const JPH::ObjectLayer first, const JPH::ObjectLayer second) const override {
    return first == jolt_layers::moving_body || second == jolt_layers::moving_body;
  }
};

class JoltBroadPhaseLayers final : public JPH::BroadPhaseLayerInterface {
 public:
  [[nodiscard]] JPH::uint GetNumBroadPhaseLayers() const override { return jolt_layers::broad_phase_count; }

  [[nodiscard]] JPH::BroadPhaseLayer GetBroadPhaseLayer(const JPH::ObjectLayer layer) const override {
    return layer == jolt_layers::static_body ? jolt_layers::static_broad_phase : jolt_layers::moving_broad_phase;
  }

  [[nodiscard]] const char* GetBroadPhaseLayerName(const JPH::BroadPhaseLayer layer) const override {
    return layer == jolt_layers::static_broad_phase ? "static" : "moving";
  }
};

class JoltObjectVsBroadPhaseFilter final : public JPH::ObjectVsBroadPhaseLayerFilter {
 public:
  [[nodiscard]] bool ShouldCollide(const JPH::ObjectLayer layer, const JPH::BroadPhaseLayer broad_phase) const override {
    return layer == jolt_layers::moving_body || broad_phase == jolt_layers::moving_broad_phase;
  }
};

class JoltContactListener final : public JPH::ContactListener {
 public:
  void clear() { contacts_.clear(); }

  [[nodiscard]] const std::vector<PhysicsContact>& contacts() const noexcept { return contacts_; }

  void OnContactAdded(const JPH::Body& first, const JPH::Body& second, const JPH::ContactManifold& manifold,
      JPH::ContactSettings&) override {
    record(first, second, manifold);
  }

  void OnContactPersisted(const JPH::Body& first, const JPH::Body& second, const JPH::ContactManifold& manifold,
      JPH::ContactSettings&) override {
    record(first, second, manifold);
  }

 private:
  void record(const JPH::Body& first, const JPH::Body& second, const JPH::ContactManifold& manifold) {
    std::uint32_t first_id = static_cast<std::uint32_t>(first.GetUserData());
    std::uint32_t second_id = static_cast<std::uint32_t>(second.GetUserData());
    std::int32_t normal_x = quantize_normal(manifold.mWorldSpaceNormal.GetX());
    std::int32_t normal_y = quantize_normal(manifold.mWorldSpaceNormal.GetY());
    std::int32_t normal_z = quantize_normal(manifold.mWorldSpaceNormal.GetZ());
    if (first_id > second_id) {
      std::swap(first_id, second_id);
      normal_x = -normal_x;
      normal_y = -normal_y;
      normal_z = -normal_z;
    }
    contacts_.push_back({first_id, second_id, normal_x, normal_y, normal_z, first.IsSensor() || second.IsSensor()});
  }

  std::vector<PhysicsContact> contacts_;
};

class JoltGlobal final {
 public:
  JoltGlobal() {
    JPH::RegisterDefaultAllocator();
    JPH::Factory::sInstance = new JPH::Factory();
    JPH::RegisterTypes();
  }

  ~JoltGlobal() {
    JPH::UnregisterTypes();
    delete JPH::Factory::sInstance;
    JPH::Factory::sInstance = nullptr;
  }

  JoltGlobal(const JoltGlobal&) = delete;
  JoltGlobal& operator=(const JoltGlobal&) = delete;
};

JoltGlobal& jolt_global() {
  static JoltGlobal global;
  return global;
}

class JoltWorld final {
 public:
  JoltWorld() {
    static_cast<void>(jolt_global());
    allocator_ = std::make_unique<JPH::TempAllocatorImpl>(2U * 1024U * 1024U);
    jobs_ = std::make_unique<JPH::JobSystemSingleThreaded>(JPH::cMaxPhysicsJobs);
    physics_.Init(256U, 0U, 1024U, 1024U, broad_phase_layers_, object_vs_broad_phase_, object_layer_pairs_);
    physics_.SetGravity(JPH::Vec3::sZero());
    physics_.SetContactListener(&contacts_);
  }

  ~JoltWorld() {
    JPH::BodyInterface& bodies = physics_.GetBodyInterface();
    for (const auto& [id, body] : ids_) {
      static_cast<void>(id);
      bodies.RemoveBody(body);
      bodies.DestroyBody(body);
    }
  }

  [[nodiscard]] PhysicsError add(const PhysicsBodyDefinition& definition) {
    const JPH::EMotionType motion = definition.kind == PhysicsBodyKind::static_body
        ? JPH::EMotionType::Static
        : definition.kind == PhysicsBodyKind::kinematic ? JPH::EMotionType::Kinematic : JPH::EMotionType::Dynamic;
    const JPH::ObjectLayer layer = motion == JPH::EMotionType::Static ? jolt_layers::static_body : jolt_layers::moving_body;
    JPH::BoxShapeSettings box(JPH::Vec3(
        static_cast<float>(meters(definition.box.half_x_milli)),
        static_cast<float>(meters(definition.box.half_y_milli)),
        static_cast<float>(meters(definition.box.half_z_milli))));
    box.SetEmbedded();
    const JPH::ShapeSettings::ShapeResult shape_result = box.Create();
    if (shape_result.HasError()) return PhysicsError::collider_invalid;
    JPH::BodyCreationSettings settings(shape_result.Get(), JPH::RVec3(
        meters(definition.position.x_milli), meters(definition.position.y_milli), meters(definition.position.z_milli)),
        JPH::Quat::sIdentity(), motion, layer);
    settings.mIsSensor = definition.kind == PhysicsBodyKind::trigger;
    settings.mUserData = definition.id;
    JPH::BodyInterface& bodies = physics_.GetBodyInterface();
    const JPH::BodyID body = bodies.CreateAndAddBody(settings,
        motion == JPH::EMotionType::Static ? JPH::EActivation::DontActivate : JPH::EActivation::Activate);
    if (body.IsInvalid()) return PhysicsError::body_invalid;
    bodies.SetLinearVelocity(body, JPH::Vec3(
        static_cast<float>(meters(definition.velocity.x_milli)),
        static_cast<float>(meters(definition.velocity.y_milli)),
        static_cast<float>(meters(definition.velocity.z_milli))));
    ids_.emplace(definition.id, body);
    return PhysicsError::none;
  }

  [[nodiscard]] PhysicsError set_velocity(const std::uint32_t id, const PhysicsVelocity velocity) {
    const auto found = ids_.find(id);
    if (found == ids_.end()) return PhysicsError::body_unknown;
    physics_.GetBodyInterface().SetLinearVelocity(found->second, JPH::Vec3(
        static_cast<float>(meters(velocity.x_milli)), static_cast<float>(meters(velocity.y_milli)),
        static_cast<float>(meters(velocity.z_milli))));
    return PhysicsError::none;
  }

  [[nodiscard]] PhysicsError step(std::map<std::uint32_t, PhysicsBodyDefinition>& definitions,
      std::vector<PhysicsContact>& contacts) {
    contacts_.clear();
    const auto update = physics_.Update(simulation_step_seconds, 1, allocator_.get(), jobs_.get());
    if (update != JPH::EPhysicsUpdateError::None) return PhysicsError::solver_unavailable;
    contacts = contacts_.contacts();
    canonicalize_contacts(contacts);
    const JPH::BodyInterface& bodies = physics_.GetBodyInterface();
    for (auto& [id, definition] : definitions) {
      const auto found = ids_.find(id);
      if (found == ids_.end()) return PhysicsError::body_unknown;
      const JPH::RVec3 position = bodies.GetCenterOfMassPosition(found->second);
      const JPH::Vec3 velocity = bodies.GetLinearVelocity(found->second);
      if (const auto error = snapshot_from_values(definition, position.GetX(), position.GetY(), position.GetZ(),
              velocity.GetX(), velocity.GetY(), velocity.GetZ());
          error != PhysicsError::none) {
        return error;
      }
    }
    return PhysicsError::none;
  }

 private:
  JoltBroadPhaseLayers broad_phase_layers_;
  JoltObjectVsBroadPhaseFilter object_vs_broad_phase_;
  JoltObjectLayerPairFilter object_layer_pairs_;
  JoltContactListener contacts_;
  JPH::PhysicsSystem physics_;
  std::unique_ptr<JPH::TempAllocatorImpl> allocator_;
  std::unique_ptr<JPH::JobSystemSingleThreaded> jobs_;
  std::map<std::uint32_t, JPH::BodyID> ids_;
};
#endif

#if LUDIVRA_HAS_BOX2D_PHYSICS
class Box2dWorld final {
 public:
  Box2dWorld() {
    b2WorldDef definition = b2DefaultWorldDef();
    definition.gravity = {0.0F, 0.0F};
    world_ = b2CreateWorld(&definition);
  }

  ~Box2dWorld() {
    b2DestroyWorld(world_);
  }

  [[nodiscard]] PhysicsError add(const PhysicsBodyDefinition& definition) {
    b2BodyDef body_definition = b2DefaultBodyDef();
    body_definition.type = definition.kind == PhysicsBodyKind::static_body
        ? b2_staticBody
        : definition.kind == PhysicsBodyKind::kinematic ? b2_kinematicBody : b2_dynamicBody;
    body_definition.position = {static_cast<float>(meters(definition.position.x_milli)),
        static_cast<float>(meters(definition.position.z_milli))};
    body_definition.linearVelocity = {static_cast<float>(meters(definition.velocity.x_milli)),
        static_cast<float>(meters(definition.velocity.z_milli))};
    const b2BodyId body = b2CreateBody(world_, &body_definition);
    b2ShapeDef shape_definition = b2DefaultShapeDef();
    shape_definition.density = 1.0F;
    shape_definition.isSensor = definition.kind == PhysicsBodyKind::trigger;
    shape_definition.filter.categoryBits = definition.layers;
    shape_definition.filter.maskBits = definition.mask;
    const b2Polygon box = b2MakeBox(static_cast<float>(meters(definition.box.half_x_milli)),
        static_cast<float>(meters(definition.box.half_z_milli)));
    shape_definition.enableContactEvents = true;
    const b2ShapeId shape = b2CreatePolygonShape(body, &shape_definition, &box);
    b2Body_SetUserData(body, reinterpret_cast<void*>(static_cast<std::uintptr_t>(definition.id)));
    b2Shape_SetUserData(shape, reinterpret_cast<void*>(static_cast<std::uintptr_t>(definition.id)));
    ids_.emplace(definition.id, body);
    return PhysicsError::none;
  }

  [[nodiscard]] PhysicsError set_velocity(const std::uint32_t id, const PhysicsVelocity velocity) {
    const auto found = ids_.find(id);
    if (found == ids_.end()) return PhysicsError::body_unknown;
    b2Body_SetLinearVelocity(found->second, {static_cast<float>(meters(velocity.x_milli)),
        static_cast<float>(meters(velocity.z_milli))});
    return PhysicsError::none;
  }

  [[nodiscard]] PhysicsError step(std::map<std::uint32_t, PhysicsBodyDefinition>& definitions,
      std::vector<PhysicsContact>& contacts) {
    b2World_Step(world_, simulation_step_seconds, 1);
    const b2ContactEvents events = b2World_GetContactEvents(world_);
    contacts.clear();
    contacts.reserve(static_cast<std::size_t>(events.beginCount));
    for (int index = 0; index < events.beginCount; ++index) {
      const b2ContactBeginTouchEvent& event = events.beginEvents[index];
      std::uint32_t first_id = static_cast<std::uint32_t>(reinterpret_cast<std::uintptr_t>(b2Shape_GetUserData(event.shapeIdA)));
      std::uint32_t second_id = static_cast<std::uint32_t>(reinterpret_cast<std::uintptr_t>(b2Shape_GetUserData(event.shapeIdB)));
      std::int32_t normal_x = quantize_normal(event.manifold.normal.x);
      std::int32_t normal_z = quantize_normal(event.manifold.normal.y);
      if (first_id > second_id) {
        std::swap(first_id, second_id);
        normal_x = -normal_x;
        normal_z = -normal_z;
      }
      contacts.push_back({first_id, second_id, normal_x, 0, normal_z,
          b2Shape_IsSensor(event.shapeIdA) || b2Shape_IsSensor(event.shapeIdB)});
    }
    canonicalize_contacts(contacts);
    for (auto& [id, definition] : definitions) {
      const auto found = ids_.find(id);
      if (found == ids_.end()) return PhysicsError::body_unknown;
      const b2Transform transform = b2Body_GetTransform(found->second);
      const b2Vec2 velocity = b2Body_GetLinearVelocity(found->second);
      if (const auto error = snapshot_from_values(definition, transform.p.x, 0.0, transform.p.y,
              velocity.x, 0.0, velocity.y);
          error != PhysicsError::none) {
        return error;
      }
    }
    return PhysicsError::none;
  }

 private:
  b2WorldId world_{};
  std::map<std::uint32_t, b2BodyId> ids_;
};
#endif

}  // namespace

class UpstreamPhysicsAdapter::Impl final {
 public:
  explicit Impl(const UpstreamPhysicsSolver solver) {
    static_cast<void>(solver);
#if LUDIVRA_HAS_JOLT_PHYSICS
    if (solver == UpstreamPhysicsSolver::jolt_3d) jolt_ = std::make_unique<JoltWorld>();
#endif
#if LUDIVRA_HAS_BOX2D_PHYSICS
    if (solver == UpstreamPhysicsSolver::box2d_2d) box2d_ = std::make_unique<Box2dWorld>();
#endif
  }

  [[nodiscard]] PhysicsError add(const PhysicsBodyDefinition& definition) {
    static_cast<void>(definition);
#if LUDIVRA_HAS_JOLT_PHYSICS
    if (jolt_) return jolt_->add(definition);
#endif
#if LUDIVRA_HAS_BOX2D_PHYSICS
    if (box2d_) return box2d_->add(definition);
#endif
    return PhysicsError::solver_unavailable;
  }

  [[nodiscard]] PhysicsError set_velocity(const std::uint32_t id, const PhysicsVelocity velocity) {
    static_cast<void>(id);
    static_cast<void>(velocity);
#if LUDIVRA_HAS_JOLT_PHYSICS
    if (jolt_) return jolt_->set_velocity(id, velocity);
#endif
#if LUDIVRA_HAS_BOX2D_PHYSICS
    if (box2d_) return box2d_->set_velocity(id, velocity);
#endif
    return PhysicsError::solver_unavailable;
  }

  [[nodiscard]] PhysicsError step(std::map<std::uint32_t, PhysicsBodyDefinition>& definitions,
      std::vector<PhysicsContact>& contacts) {
    static_cast<void>(definitions);
    static_cast<void>(contacts);
#if LUDIVRA_HAS_JOLT_PHYSICS
    if (jolt_) return jolt_->step(definitions, contacts);
#endif
#if LUDIVRA_HAS_BOX2D_PHYSICS
    if (box2d_) return box2d_->step(definitions, contacts);
#endif
    return PhysicsError::solver_unavailable;
  }

 private:
#if LUDIVRA_HAS_JOLT_PHYSICS
  std::unique_ptr<JoltWorld> jolt_;
#endif
#if LUDIVRA_HAS_BOX2D_PHYSICS
  std::unique_ptr<Box2dWorld> box2d_;
#endif
};

UpstreamPhysicsAdapter::UpstreamPhysicsAdapter(const UpstreamPhysicsSolver solver) : solver_(solver), impl_(std::make_unique<Impl>(solver)) {}
UpstreamPhysicsAdapter::~UpstreamPhysicsAdapter() = default;
UpstreamPhysicsAdapter::UpstreamPhysicsAdapter(UpstreamPhysicsAdapter&&) noexcept = default;
UpstreamPhysicsAdapter& UpstreamPhysicsAdapter::operator=(UpstreamPhysicsAdapter&&) noexcept = default;

UpstreamPhysicsAvailability UpstreamPhysicsAdapter::availability() const noexcept {
  static_cast<void>(solver_);
  if (impl_ == nullptr) return UpstreamPhysicsAvailability::not_compiled;
#if LUDIVRA_HAS_JOLT_PHYSICS
  if (solver_ == UpstreamPhysicsSolver::jolt_3d) return UpstreamPhysicsAvailability::available;
#endif
#if LUDIVRA_HAS_BOX2D_PHYSICS
  if (solver_ == UpstreamPhysicsSolver::box2d_2d) return UpstreamPhysicsAvailability::available;
#endif
#if LUDIVRA_UPSTREAM_PHYSICS_TARGET_DISABLED
  return UpstreamPhysicsAvailability::target_disabled;
#else
  return UpstreamPhysicsAvailability::not_compiled;
#endif
}

PhysicsError UpstreamPhysicsAdapter::add_body(const PhysicsBodyDefinition definition) {
  if (availability() != UpstreamPhysicsAvailability::available) return PhysicsError::solver_unavailable;
  if (!has_valid_box(definition)) return definition.id == 0U || definition.layers == 0U || definition.mask == 0U
      ? PhysicsError::body_invalid
      : PhysicsError::collider_invalid;
  if (definition.authority == PhysicsAuthority::host) return PhysicsError::solver_authority_unsupported;
  if (definitions_.contains(definition.id)) return PhysicsError::body_duplicate;
  if (const auto error = impl_->add(definition); error != PhysicsError::none) return error;
  definitions_.emplace(definition.id, definition);
  replay_additions_.push_back({completed_steps_, definition});
  return PhysicsError::none;
}

PhysicsError UpstreamPhysicsAdapter::set_velocity(const std::uint32_t id, const PhysicsVelocity velocity) {
  if (availability() != UpstreamPhysicsAvailability::available) return PhysicsError::solver_unavailable;
  const auto found = definitions_.find(id);
  if (found == definitions_.end()) return PhysicsError::body_unknown;
  if (const auto error = impl_->set_velocity(id, velocity); error != PhysicsError::none) return error;
  found->second.velocity = velocity;
  replay_velocity_changes_.push_back({completed_steps_, id, velocity});
  return PhysicsError::none;
}

PhysicsError UpstreamPhysicsAdapter::step() {
  if (availability() != UpstreamPhysicsAvailability::available) return PhysicsError::solver_unavailable;
  contacts_.clear();
  if (const auto error = impl_->step(definitions_, contacts_); error != PhysicsError::none) return error;
  if (completed_steps_ == std::numeric_limits<std::uint32_t>::max()) return PhysicsError::arithmetic_overflow;
  ++completed_steps_;
  return PhysicsError::none;
}

std::vector<PhysicsBodySnapshot> UpstreamPhysicsAdapter::inspect() const {
  std::vector<PhysicsBodySnapshot> snapshots;
  snapshots.reserve(definitions_.size());
  for (const auto& [id, definition] : definitions_) {
    snapshots.push_back({id, definition.authority, definition.kind, definition.position, definition.velocity});
  }
  return snapshots;
}

std::vector<PhysicsContact> UpstreamPhysicsAdapter::contacts() const {
  return contacts_;
}

std::uint64_t UpstreamPhysicsAdapter::replay_hash() const noexcept {
  std::uint64_t hash = fnv_offset;
  mix_byte(hash, static_cast<std::uint8_t>(solver_));
  mix_u32(hash, completed_steps_);
  for (const auto& [id, definition] : definitions_) {
    mix_u32(hash, id);
    mix_byte(hash, static_cast<std::uint8_t>(definition.authority));
    mix_byte(hash, static_cast<std::uint8_t>(definition.kind));
    mix_u32(hash, definition.layers);
    mix_u32(hash, definition.mask);
    mix_u32(hash, definition.position.dimension);
    mix_i64(hash, definition.position.x_milli);
    mix_i64(hash, definition.position.y_milli);
    mix_i64(hash, definition.position.z_milli);
    mix_i64(hash, definition.velocity.x_milli);
    mix_i64(hash, definition.velocity.y_milli);
    mix_i64(hash, definition.velocity.z_milli);
  }
  for (const auto& contact : contacts_) {
    mix_u32(hash, contact.first_id);
    mix_u32(hash, contact.second_id);
    mix_u32(hash, static_cast<std::uint32_t>(contact.normal_x_milli));
    mix_u32(hash, static_cast<std::uint32_t>(contact.normal_y_milli));
    mix_u32(hash, static_cast<std::uint32_t>(contact.normal_z_milli));
    mix_byte(hash, contact.trigger ? 1U : 0U);
  }
  return hash;
}

std::vector<std::uint8_t> UpstreamPhysicsAdapter::replay_write() const {
  std::vector<std::uint8_t> bytes;
  bytes.reserve(21U + replay_additions_.size() * 94U + replay_velocity_changes_.size() * 32U);
  write_u32(bytes, replay_magic);
  write_u32(bytes, replay_version);
  write_u8(bytes, static_cast<std::uint8_t>(solver_));
  write_u32(bytes, completed_steps_);
  write_u32(bytes, static_cast<std::uint32_t>(replay_additions_.size()));
  write_u32(bytes, static_cast<std::uint32_t>(replay_velocity_changes_.size()));
  for (const auto& addition : replay_additions_) {
    write_u32(bytes, addition.tick);
    write_body(bytes, addition.definition);
  }
  for (const auto& change : replay_velocity_changes_) {
    write_u32(bytes, change.tick);
    write_u32(bytes, change.id);
    write_velocity(bytes, change.velocity);
  }
  return bytes;
}

PhysicsError UpstreamPhysicsAdapter::replay_load(const std::vector<std::uint8_t>& bytes) {
  if (availability() != UpstreamPhysicsAvailability::available) return PhysicsError::solver_unavailable;
  ReplayReader reader(bytes);
  std::uint32_t magic = 0U;
  std::uint32_t version = 0U;
  std::uint8_t solver = 0U;
  std::uint32_t completed_steps = 0U;
  std::uint32_t addition_count = 0U;
  std::uint32_t velocity_change_count = 0U;
  if (!reader.read_u32(magic) || !reader.read_u32(version) || !reader.read_u8(solver) || !reader.read_u32(completed_steps) ||
      !reader.read_u32(addition_count) || !reader.read_u32(velocity_change_count) ||
      magic != replay_magic || version != replay_version || solver != static_cast<std::uint8_t>(solver_) ||
      addition_count > maximum_replay_bodies || velocity_change_count > maximum_replay_velocity_changes) {
    return PhysicsError::replay_invalid;
  }

  std::vector<ReplayBodyAddition> additions;
  additions.reserve(addition_count);
  for (std::uint32_t index = 0U; index < addition_count; ++index) {
    PhysicsBodyDefinition definition{};
    std::uint32_t tick = 0U;
    if (!reader.read_u32(tick) || !read_body(reader, definition) || !has_valid_box(definition) ||
        definition.authority == PhysicsAuthority::host || tick > completed_steps) {
      return PhysicsError::replay_invalid;
    }
    additions.push_back({tick, definition});
  }
  std::vector<ReplayVelocityChange> changes;
  changes.reserve(velocity_change_count);
  for (std::uint32_t index = 0U; index < velocity_change_count; ++index) {
    ReplayVelocityChange change{};
    if (!reader.read_u32(change.tick) || !reader.read_u32(change.id) || !read_velocity(reader, change.velocity) ||
        change.tick > completed_steps) {
      return PhysicsError::replay_invalid;
    }
    changes.push_back(change);
  }
  if (!reader.done()) return PhysicsError::replay_invalid;

  auto replacement = std::make_unique<Impl>(solver_);
  std::map<std::uint32_t, PhysicsBodyDefinition> restored;
  std::vector<PhysicsContact> restored_contacts;
  std::size_t addition_cursor = 0U;
  std::size_t change_cursor = 0U;
  for (std::uint32_t tick = 0U; tick <= completed_steps; ++tick) {
    while (addition_cursor < additions.size() && additions[addition_cursor].tick == tick) {
      const PhysicsBodyDefinition& definition = additions[addition_cursor].definition;
      if (restored.contains(definition.id) || replacement->add(definition) != PhysicsError::none) return PhysicsError::replay_invalid;
      restored.emplace(definition.id, definition);
      ++addition_cursor;
    }
    while (change_cursor < changes.size() && changes[change_cursor].tick == tick) {
      const ReplayVelocityChange& change = changes[change_cursor];
      const auto found = restored.find(change.id);
      if (found == restored.end() || replacement->set_velocity(change.id, change.velocity) != PhysicsError::none) {
        return PhysicsError::replay_invalid;
      }
      found->second.velocity = change.velocity;
      ++change_cursor;
    }
    if (tick < completed_steps) {
      if (const auto error = replacement->step(restored, restored_contacts); error != PhysicsError::none) return error;
    }
  }
  if (addition_cursor != additions.size() || change_cursor != changes.size()) return PhysicsError::replay_invalid;
  impl_ = std::move(replacement);
  definitions_ = std::move(restored);
  contacts_ = std::move(restored_contacts);
  replay_additions_ = std::move(additions);
  replay_velocity_changes_ = std::move(changes);
  completed_steps_ = completed_steps;
  return PhysicsError::none;
}

std::vector<UpstreamPhysicsSolverDescriptor> upstream_physics_solvers() {
  const auto jolt_availability = [] {
#if LUDIVRA_HAS_JOLT_PHYSICS
    return UpstreamPhysicsAvailability::available;
#elif LUDIVRA_UPSTREAM_PHYSICS_TARGET_DISABLED
    return UpstreamPhysicsAvailability::target_disabled;
#else
    return UpstreamPhysicsAvailability::not_compiled;
#endif
  }();
  const auto box2d_availability = [] {
#if LUDIVRA_HAS_BOX2D_PHYSICS
    return UpstreamPhysicsAvailability::available;
#elif LUDIVRA_UPSTREAM_PHYSICS_TARGET_DISABLED
    return UpstreamPhysicsAvailability::target_disabled;
#else
    return UpstreamPhysicsAvailability::not_compiled;
#endif
  }();
  return {
      {UpstreamPhysicsSolver::jolt_3d, jolt_availability, "5.3.0", "0373ec0dd762e4bc2f6acdb08371ee84fa23c6db", true},
      {UpstreamPhysicsSolver::box2d_2d, box2d_availability, "3.1.1", "8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3", true}
  };
}

}  // namespace ludivra::kernel
