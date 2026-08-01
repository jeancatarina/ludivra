#include "motion_reference.hpp"

#include "fixed_point.hpp"

#include <limits>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_offset = 14695981039346656037ULL;
constexpr std::uint64_t fnv_prime = 1099511628211ULL;

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

bool same_dimension(const SpatialGlobalPosition left, const SpatialGlobalPosition right) noexcept {
  return left.dimension == right.dimension;
}

MotionError tween_component(
    const std::int64_t start,
    const std::int64_t target,
    const std::int64_t elapsed,
    const std::int64_t duration,
    std::int64_t& out) noexcept {
  const auto delta = fixed_subtract(target, start);
  const auto ratio = fixed_divide(elapsed, duration, default_fixed_scale);
  if (delta.error != FixedError::none || ratio.error != FixedError::none) return MotionError::arithmetic_overflow;
  const auto offset = fixed_multiply(delta.value, ratio.value, default_fixed_scale);
  if (offset.error != FixedError::none) return MotionError::arithmetic_overflow;
  const auto value = fixed_add(start, offset.value);
  if (value.error != FixedError::none) return MotionError::arithmetic_overflow;
  out = value.value;
  return MotionError::none;
}

MotionError ballistic_component(
    const std::int64_t start,
    const std::int64_t velocity,
    const std::int64_t acceleration,
    const std::int64_t elapsed,
    std::int64_t& out) noexcept {
  const auto velocity_offset = fixed_multiply(velocity, elapsed, 0U);
  const auto acceleration_step = fixed_multiply(acceleration, elapsed, 0U);
  if (velocity_offset.error != FixedError::none || acceleration_step.error != FixedError::none) {
    return MotionError::arithmetic_overflow;
  }
  const auto acceleration_square = fixed_multiply(acceleration_step.value, elapsed, 0U);
  if (acceleration_square.error != FixedError::none) return MotionError::arithmetic_overflow;
  const auto half_acceleration = fixed_divide(acceleration_square.value, 2, 0U);
  if (half_acceleration.error != FixedError::none) return MotionError::arithmetic_overflow;
  const auto linear = fixed_add(start, velocity_offset.value);
  if (linear.error != FixedError::none) return MotionError::arithmetic_overflow;
  const auto position = fixed_add(linear.value, half_acceleration.value);
  if (position.error != FixedError::none) return MotionError::arithmetic_overflow;
  out = position.value;
  return MotionError::none;
}

}  // namespace

MotionError ReferenceMotion::install(const MotionDefinition definition) {
  if (definition.id == 0U || definition.entity_id == 0U || tracks_.contains(definition.id) ||
      definition.duration > static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max())) {
    return definition.id != 0U && tracks_.contains(definition.id) ? MotionError::id_duplicate : MotionError::definition_invalid;
  }
  if ((definition.kind == MotionKind::snap && definition.duration != 0U) ||
      (definition.kind != MotionKind::snap && definition.duration == 0U) ||
      ((definition.kind == MotionKind::snap || definition.kind == MotionKind::tween) &&
          !same_dimension(definition.start, definition.target))) {
    return MotionError::definition_invalid;
  }
  tracks_.emplace(definition.id, Track{definition, MotionStatus::scheduled, MotionCancelCause::none});
  return MotionError::none;
}

MotionError ReferenceMotion::cancel(const std::uint32_t id, const MotionCancelCause cause) {
  if (cause == MotionCancelCause::none) return MotionError::cancel_cause_required;
  const auto found = tracks_.find(id);
  if (found == tracks_.end()) return MotionError::motion_unknown;
  if (found->second.status == MotionStatus::completed || found->second.status == MotionStatus::cancelled) return MotionError::none;
  found->second.status = MotionStatus::cancelled;
  found->second.cancel_cause = cause;
  return MotionError::none;
}

MotionError ReferenceMotion::sample(
    const MotionDefinition& definition,
    const std::uint64_t elapsed,
    SpatialGlobalPosition& out) const {
  out = definition.start;
  if (definition.kind == MotionKind::snap ||
      (elapsed >= definition.duration && definition.kind == MotionKind::tween)) {
    out = definition.target;
    return MotionError::none;
  }
  const auto time = static_cast<std::int64_t>(elapsed);
  if (definition.kind == MotionKind::tween) {
    const auto duration = static_cast<std::int64_t>(definition.duration);
    MotionError error = tween_component(definition.start.x_milli, definition.target.x_milli, time, duration, out.x_milli);
    if (error != MotionError::none) return error;
    error = tween_component(definition.start.y_milli, definition.target.y_milli, time, duration, out.y_milli);
    if (error != MotionError::none) return error;
    return tween_component(definition.start.z_milli, definition.target.z_milli, time, duration, out.z_milli);
  }
  MotionError error = ballistic_component(definition.start.x_milli, definition.velocity.x_milli, definition.acceleration.x_milli, time, out.x_milli);
  if (error != MotionError::none) return error;
  error = ballistic_component(definition.start.y_milli, definition.velocity.y_milli, definition.acceleration.y_milli, time, out.y_milli);
  if (error != MotionError::none) return error;
  return ballistic_component(definition.start.z_milli, definition.velocity.z_milli, definition.acceleration.z_milli, time, out.z_milli);
}

std::vector<MotionSample> ReferenceMotion::advance(const MotionClock clock, const std::uint64_t time) {
  std::vector<MotionSample> samples;
  for (auto& [id, track] : tracks_) {
    if (track.definition.clock != clock || track.status == MotionStatus::cancelled || track.status == MotionStatus::completed ||
        time < track.definition.start_time) continue;
    SpatialGlobalPosition position{};
    const auto elapsed = track.definition.kind == MotionKind::snap ? 0U :
        (time - track.definition.start_time > track.definition.duration ? track.definition.duration : time - track.definition.start_time);
    const auto error = sample(track.definition, elapsed, position);
    if (error != MotionError::none) {
      track.status = MotionStatus::cancelled;
      track.cancel_cause = MotionCancelCause::arithmetic_failure;
      continue;
    }
    track.status = MotionStatus::running;
    const bool completed = track.definition.kind == MotionKind::snap || elapsed == track.definition.duration;
    if (completed) track.status = MotionStatus::completed;
    samples.push_back({id, track.definition.entity_id, clock, track.status, position});
  }
  return samples;
}

std::vector<MotionSample> ReferenceMotion::advance_logical(const std::uint64_t tick) {
  return advance(MotionClock::logical, tick);
}

std::vector<MotionSample> ReferenceMotion::advance_presentation(const std::uint64_t milliseconds) {
  return advance(MotionClock::presentation, milliseconds);
}

std::vector<MotionInspection> ReferenceMotion::inspect() const {
  std::vector<MotionInspection> inspection;
  inspection.reserve(tracks_.size());
  for (const auto& entry : tracks_) inspection.push_back({entry.second.definition, entry.second.status, entry.second.cancel_cause});
  return inspection;
}

std::uint64_t ReferenceMotion::logical_hash() const noexcept {
  std::uint64_t hash = fnv_offset;
  for (const auto& [id, track] : tracks_) {
    if (track.definition.clock != MotionClock::logical) continue;
    mix_u32(hash, id);
    mix_u32(hash, track.definition.entity_id);
    mix_byte(hash, static_cast<std::uint8_t>(track.definition.kind));
    mix_byte(hash, static_cast<std::uint8_t>(track.status));
    mix_byte(hash, static_cast<std::uint8_t>(track.cancel_cause));
    mix_u32(hash, track.definition.start.dimension);
    mix_u64(hash, track.definition.start_time);
    mix_u64(hash, track.definition.duration);
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.start.x_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.start.y_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.start.z_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.target.x_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.target.y_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.target.z_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.velocity.x_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.velocity.y_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.velocity.z_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.acceleration.x_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.acceleration.y_milli));
    mix_u64(hash, static_cast<std::uint64_t>(track.definition.acceleration.z_milli));
  }
  return hash;
}

}  // namespace ludivra::kernel
