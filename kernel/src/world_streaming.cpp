#include "world_streaming.hpp"

#include <algorithm>
#include <set>

namespace ludivra::kernel {

StreamingPlan plan_streaming(
    const ChunkRegistry& registry,
    const WorldPosition viewer,
    const StreamingWindow& window) {
  StreamingPlan plan;
  const auto centre = normalize(viewer);
  if (centre.error != WorldPositionError::none) return plan;

  std::set<ChunkIdentity> wanted;
  for (std::int32_t z = -window.radius; z <= window.radius; ++z) {
    for (std::int32_t x = -window.radius; x <= window.radius; ++x) {
      wanted.insert(ChunkIdentity{
          centre.value.dimension,
          centre.value.chunk_x + x,
          centre.value.chunk_y,
          centre.value.chunk_z + z,
          window.generator_id,
          window.generator_version});
    }
  }

  std::set<ChunkIdentity> known;
  for (const auto& record : registry.snapshot()) known.insert(record.identity);

  // Ordered containers make both lists deterministic without a sort afterwards.
  std::set_difference(
      wanted.begin(), wanted.end(), known.begin(), known.end(), std::back_inserter(plan.to_request));
  std::set_difference(
      known.begin(), known.end(), wanted.begin(), wanted.end(), std::back_inserter(plan.to_evict));
  return plan;
}

}  // namespace ludivra::kernel
