#pragma once

#include "world_chunks.hpp"
#include "world_position.hpp"

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

struct StreamingWindow final {
  /// Chunks kept resident around the viewer, measured in chunks on each axis.
  std::int32_t radius;
  std::uint32_t generator_id;
  std::uint32_t generator_version;
};

/**
 * What the world should load and release for a viewer position.
 *
 * The plan is a pure function of the window, the viewer and what is currently
 * known: the same walk produces the same plan on every machine, which is what
 * keeps streaming out of the set of things that can make a replay diverge.
 */
struct StreamingPlan final {
  std::vector<ChunkIdentity> to_request;
  std::vector<ChunkIdentity> to_evict;
};

[[nodiscard]] StreamingPlan plan_streaming(
    const ChunkRegistry& registry,
    WorldPosition viewer,
    const StreamingWindow& window);

}  // namespace ludivra::kernel
