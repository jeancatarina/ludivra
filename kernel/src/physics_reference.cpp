#include "physics_reference.hpp"

#include "fixed_point.hpp"

#include <algorithm>
#include <limits>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_offset = 14695981039346656037ULL;
constexpr std::uint64_t fnv_prime = 1099511628211ULL;

std::int64_t magnitude(const std::int64_t value) noexcept {
  return value < 0 ? -value : value;
}

void mix_byte(std::uint64_t& hash, const std::uint8_t value) noexcept {
  hash ^= value;
  hash *= fnv_prime;
}

void mix_u32(std::uint64_t& hash, const std::uint32_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 32U; shift += 8U) mix_byte(hash, static_cast<std::uint8_t>(value >> shift));
}

void mix_u64(std::uint64_t& hash, const std::uint64_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 64U; shift += 8U) mix_byte(hash, static_cast<std::uint8_t>(value >> shift));
}

bool movable(const PhysicsBodyKind kind) noexcept {
  return kind == PhysicsBodyKind::dynamic || kind == PhysicsBodyKind::kinematic;
}

}  // namespace

bool ReferencePhysics::collides_by_layer(const PhysicsBodyDefinition& first, const PhysicsBodyDefinition& second) noexcept {
  return (first.layers & second.mask) != 0U && (second.layers & first.mask) != 0U;
}

bool ReferencePhysics::collides(const PhysicsBodyDefinition& first, const PhysicsBodyDefinition& second) noexcept {
  if (first.position.dimension != second.position.dimension || !collides_by_layer(first, second)) return false;
  const auto overlap = [](const std::int64_t left, const std::int64_t right, const std::int64_t left_half, const std::int64_t right_half) {
    return magnitude(right - left) < left_half + right_half;
  };
  return overlap(first.position.x_milli, second.position.x_milli, first.box.half_x_milli, second.box.half_x_milli) &&
      overlap(first.position.y_milli, second.position.y_milli, first.box.half_y_milli, second.box.half_y_milli) &&
      overlap(first.position.z_milli, second.position.z_milli, first.box.half_z_milli, second.box.half_z_milli);
}

PhysicsError ReferencePhysics::add_body(const PhysicsBodyDefinition definition) {
  if (definition.id == 0U || definition.layers == 0U || definition.mask == 0U) return PhysicsError::body_invalid;
  if (bodies_.contains(definition.id)) return PhysicsError::body_duplicate;
  if (definition.box.half_x_milli <= 0 || definition.box.half_y_milli <= 0 || definition.box.half_z_milli <= 0) {
    return PhysicsError::collider_invalid;
  }
  bodies_.emplace(definition.id, definition);
  return PhysicsError::none;
}

PhysicsError ReferencePhysics::set_velocity(const std::uint32_t id, const PhysicsVelocity velocity) {
  const auto found = bodies_.find(id);
  if (found == bodies_.end()) return PhysicsError::body_unknown;
  found->second.velocity = velocity;
  return PhysicsError::none;
}

PhysicsError ReferencePhysics::integrate(PhysicsBodyDefinition& body) noexcept {
  if (!movable(body.kind)) return PhysicsError::none;
  const auto x = fixed_add(body.position.x_milli, body.velocity.x_milli);
  const auto y = fixed_add(body.position.y_milli, body.velocity.y_milli);
  const auto z = fixed_add(body.position.z_milli, body.velocity.z_milli);
  if (x.error != FixedError::none || y.error != FixedError::none || z.error != FixedError::none) return PhysicsError::arithmetic_overflow;
  body.position.x_milli = x.value;
  body.position.y_milli = y.value;
  body.position.z_milli = z.value;
  return PhysicsError::none;
}

void ReferencePhysics::resolve(PhysicsBodyDefinition& first, PhysicsBodyDefinition& second, PhysicsContact& contact) noexcept {
  contact = {first.id, second.id, 0, 0, 0, first.kind == PhysicsBodyKind::trigger || second.kind == PhysicsBodyKind::trigger};
  if (contact.trigger) return;
  const auto penetration = [](const std::int64_t left, const std::int64_t right, const std::int64_t left_half, const std::int64_t right_half) {
    return left_half + right_half - magnitude(right - left);
  };
  const std::int64_t x = penetration(first.position.x_milli, second.position.x_milli, first.box.half_x_milli, second.box.half_x_milli);
  const std::int64_t y = penetration(first.position.y_milli, second.position.y_milli, first.box.half_y_milli, second.box.half_y_milli);
  const std::int64_t z = penetration(first.position.z_milli, second.position.z_milli, first.box.half_z_milli, second.box.half_z_milli);
  const bool resolve_x = x <= y && x <= z;
  const bool resolve_y = !resolve_x && y <= z;
  const std::int64_t first_direction = resolve_x
      ? (first.position.x_milli <= second.position.x_milli ? -1 : 1)
      : resolve_y ? (first.position.y_milli <= second.position.y_milli ? -1 : 1)
                  : (first.position.z_milli <= second.position.z_milli ? -1 : 1);
  const std::int64_t amount = resolve_x ? x : resolve_y ? y : z;
  PhysicsBodyDefinition* moved = nullptr;
  if (first.kind == PhysicsBodyKind::dynamic && second.kind != PhysicsBodyKind::dynamic) moved = &first;
  else if (second.kind == PhysicsBodyKind::dynamic && first.kind != PhysicsBodyKind::dynamic) moved = &second;
  else if (first.kind == PhysicsBodyKind::dynamic && second.kind == PhysicsBodyKind::dynamic) moved = first.id < second.id ? &first : &second;
  if (moved != nullptr) {
    const std::int64_t direction = moved == &first ? first_direction : -first_direction;
    if (resolve_x) {
      moved->position.x_milli += direction * amount;
      moved->velocity.x_milli = 0;
      contact.normal_x_milli = static_cast<std::int32_t>(first_direction * 1'000);
    } else if (resolve_y) {
      moved->position.y_milli += direction * amount;
      moved->velocity.y_milli = 0;
      contact.normal_y_milli = static_cast<std::int32_t>(first_direction * 1'000);
    } else {
      moved->position.z_milli += direction * amount;
      moved->velocity.z_milli = 0;
      contact.normal_z_milli = static_cast<std::int32_t>(first_direction * 1'000);
    }
  }
}

PhysicsStep ReferencePhysics::step() {
  for (auto first = bodies_.cbegin(); first != bodies_.cend(); ++first) {
    for (auto second = std::next(first); second != bodies_.cend(); ++second) {
      if (collides_by_layer(first->second, second->second) && first->second.authority != second->second.authority) {
        return {PhysicsError::authority_mismatch, {}, {}};
      }
    }
  }
  for (auto& [id, body] : bodies_) {
    static_cast<void>(id);
    if (const auto error = integrate(body); error != PhysicsError::none) return {error, {}, {}};
  }
  contacts_.clear();
  for (auto first = bodies_.begin(); first != bodies_.end(); ++first) {
    for (auto second = std::next(first); second != bodies_.end(); ++second) {
      if (!collides(first->second, second->second)) continue;
      PhysicsContact contact{};
      resolve(first->second, second->second, contact);
      contacts_.push_back(contact);
    }
  }
  PhysicsStep result{PhysicsError::none, {}, contacts_};
  for (const auto& [id, body] : bodies_) {
    if (body.authority != PhysicsAuthority::gameplay) continue;
    result.committed_bodies.push_back({id, body.authority, body.kind, body.position, body.velocity});
  }
  return result;
}

std::vector<PhysicsBodySnapshot> ReferencePhysics::inspect() const {
  std::vector<PhysicsBodySnapshot> snapshots;
  snapshots.reserve(bodies_.size());
  for (const auto& [id, body] : bodies_) snapshots.push_back({id, body.authority, body.kind, body.position, body.velocity});
  return snapshots;
}

std::uint64_t ReferencePhysics::gameplay_hash() const noexcept {
  std::uint64_t hash = fnv_offset;
  for (const auto& [id, body] : bodies_) {
    if (body.authority != PhysicsAuthority::gameplay) continue;
    mix_u32(hash, id);
    mix_byte(hash, static_cast<std::uint8_t>(body.kind));
    mix_u32(hash, body.layers);
    mix_u32(hash, body.mask);
    mix_u64(hash, static_cast<std::uint64_t>(body.position.x_milli));
    mix_u64(hash, static_cast<std::uint64_t>(body.position.y_milli));
    mix_u64(hash, static_cast<std::uint64_t>(body.position.z_milli));
    mix_u64(hash, static_cast<std::uint64_t>(body.velocity.x_milli));
    mix_u64(hash, static_cast<std::uint64_t>(body.velocity.y_milli));
    mix_u64(hash, static_cast<std::uint64_t>(body.velocity.z_milli));
  }
  for (const auto& contact : contacts_) {
    const auto first = bodies_.find(contact.first_id);
    if (first == bodies_.end() || first->second.authority != PhysicsAuthority::gameplay) continue;
    mix_u32(hash, contact.first_id);
    mix_u32(hash, contact.second_id);
    mix_u32(hash, static_cast<std::uint32_t>(contact.normal_x_milli));
    mix_u32(hash, static_cast<std::uint32_t>(contact.normal_y_milli));
    mix_u32(hash, static_cast<std::uint32_t>(contact.normal_z_milli));
    mix_byte(hash, contact.trigger ? 1U : 0U);
  }
  return hash;
}

}  // namespace ludivra::kernel
