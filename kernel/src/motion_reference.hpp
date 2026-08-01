#pragma once

#include "regional_world.hpp"

#include <cstdint>
#include <map>
#include <vector>

namespace ludivra::kernel {

enum class MotionClock : std::uint8_t { logical, presentation };
enum class MotionKind : std::uint8_t { snap, tween, ballistic };
enum class MotionStatus : std::uint8_t { scheduled, running, completed, cancelled };
enum class MotionCancelCause : std::uint8_t { none, replaced, explicit_request, owner_removed, arithmetic_failure };

enum class MotionError : std::uint8_t {
  none,
  definition_invalid,
  id_duplicate,
  motion_unknown,
  cancel_cause_required,
  arithmetic_overflow
};

struct MotionVector final {
  std::int64_t x_milli;
  std::int64_t y_milli;
  std::int64_t z_milli;
};

/** All times are in the unit declared by clock: ticks or presentation millis. */
struct MotionDefinition final {
  std::uint32_t id;
  std::uint32_t entity_id;
  MotionClock clock;
  MotionKind kind;
  SpatialGlobalPosition start;
  SpatialGlobalPosition target;
  MotionVector velocity;
  MotionVector acceleration;
  std::uint64_t start_time;
  std::uint64_t duration;
};

struct MotionSample final {
  std::uint32_t id;
  std::uint32_t entity_id;
  MotionClock clock;
  MotionStatus status;
  SpatialGlobalPosition position;
};

struct MotionInspection final {
  MotionDefinition definition;
  MotionStatus status;
  MotionCancelCause cancel_cause;
};

/**
 * Reference Motion scheduler. It only emits position commands: the caller owns
 * applying them to RegionalWorld, so motion can never decide gameplay outcomes.
 */
class ReferenceMotion final {
 public:
  [[nodiscard]] MotionError install(MotionDefinition definition);
  [[nodiscard]] MotionError cancel(std::uint32_t id, MotionCancelCause cause);
  [[nodiscard]] std::vector<MotionSample> advance_logical(std::uint64_t tick);
  [[nodiscard]] std::vector<MotionSample> advance_presentation(std::uint64_t milliseconds);
  [[nodiscard]] std::vector<MotionInspection> inspect() const;
  [[nodiscard]] std::uint64_t logical_hash() const noexcept;

 private:
  struct Track final {
    MotionDefinition definition;
    MotionStatus status;
    MotionCancelCause cancel_cause;
  };

  std::map<std::uint32_t, Track> tracks_;

  [[nodiscard]] std::vector<MotionSample> advance(MotionClock clock, std::uint64_t time);
  [[nodiscard]] MotionError sample(const MotionDefinition& definition, std::uint64_t elapsed, SpatialGlobalPosition& out) const;
};

}  // namespace ludivra::kernel
