#pragma once

#include "world_chunks.hpp"

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

enum class JobKind : std::uint8_t {
  generate,
  mesh,
  path,
  compress,
  io
};

/**
 * Result of an asynchronous job. Jobs never mutate authoritative state: they
 * produce a result, and the result is applied at a declared commit boundary.
 */
struct JobResult final {
  JobKind kind;
  ChunkIdentity chunk;
  /// Order the job was submitted in, which breaks ties between equal chunks.
  std::uint64_t sequence;
  std::uint64_t payload_hash;
};

/**
 * Queue whose commit order is a declared key, never the order results arrived in.
 *
 * That is the whole property: with the same inputs and completions in any order,
 * the world ends up identical. Without it, thread scheduling would leak into the
 * simulation and replays would stop reproducing.
 */
class JobQueue final {
 public:
  void submit(JobResult result);

  /// Drains every pending result, ordered by kind, dimension, coordinate and
  /// sequence. A job that has not completed simply is not here yet.
  [[nodiscard]] std::vector<JobResult> commit();

  [[nodiscard]] std::size_t pending() const noexcept;

 private:
  std::vector<JobResult> pending_;
};

}  // namespace ludivra::kernel
