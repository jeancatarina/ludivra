#include "world_jobs.hpp"

#include <algorithm>
#include <tuple>

namespace ludivra::kernel {

void JobQueue::submit(JobResult result) {
  pending_.push_back(result);
}

std::vector<JobResult> JobQueue::commit() {
  std::vector<JobResult> ordered;
  ordered.swap(pending_);
  std::sort(ordered.begin(), ordered.end(), [](const JobResult& left, const JobResult& right) {
    return std::tie(left.kind, left.chunk.dimension, left.chunk.x, left.chunk.y, left.chunk.z, left.sequence) <
        std::tie(right.kind, right.chunk.dimension, right.chunk.x, right.chunk.y, right.chunk.z, right.sequence);
  });
  return ordered;
}

std::size_t JobQueue::pending() const noexcept {
  return pending_.size();
}

}  // namespace ludivra::kernel
