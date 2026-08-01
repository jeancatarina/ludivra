#pragma once

#include "world_chunks.hpp"
#include "world_jobs.hpp"

#include <cstdint>
#include <map>
#include <vector>

namespace ludivra::kernel {

/** Simulation detail is an authoritative policy, never a wall-clock heuristic. */
enum class SimulationLod : std::uint8_t { active, simplified, aggregated, unloaded };

struct SimulationLodRecord final {
  ChunkIdentity chunk;
  SimulationLod lod;
  /// Last logical tick delivered to the consumer at this detail level.
  std::uint64_t last_tick;
};

struct SimulationCatchUp final {
  ChunkIdentity chunk;
  SimulationLod lod;
  /// Exact logical elapsed time to apply; this is the deterministic catch-up.
  std::uint64_t elapsed_ticks;
};

class SimulationLodScheduler final {
 public:
  void set(ChunkIdentity chunk, SimulationLod lod, std::uint64_t tick);
  void erase(const ChunkIdentity& chunk);
  [[nodiscard]] std::vector<SimulationCatchUp> advance(std::uint64_t tick);
  [[nodiscard]] std::vector<SimulationLodRecord> snapshot() const;

 private:
  std::map<ChunkIdentity, SimulationLodRecord> records_;
};

struct ScheduledWorldJob final {
  JobKind kind;
  ChunkIdentity chunk;
  std::uint64_t sequence;
  /// Cooperatively consumed units. A job that outlives a tick stays pending.
  std::uint32_t remaining_steps;
};

struct WorldRuntimeConfig final {
  std::uint64_t root_seed;
  /// Maximum cooperative steps executed by one authoritative tick.
  std::uint32_t job_steps_per_tick;
  std::uint32_t generation_steps;
  std::uint32_t mesh_steps;
};

enum class WorldRuntimeError : std::uint8_t {
  none,
  configuration_invalid,
  chunk_error
};

struct WorldAdvance final {
  std::uint64_t tick;
  WorldRuntimeError error;
  std::vector<JobResult> committed_jobs;
  std::vector<SimulationCatchUp> simulation_updates;
};

struct WorldInspection final {
  std::uint64_t tick;
  std::vector<ChunkRecord> chunks;
  std::vector<ScheduledWorldJob> pending_jobs;
  std::vector<SimulationLodRecord> simulation;
};

/**
 * Cooperatively executes pure generation/meshing jobs. Completion timing can
 * vary with the budget, but application order is fixed by JobQueue's key; no
 * job mutates a chunk outside this runtime's commit boundary.
 */
class WorldRuntime final {
 public:
  explicit WorldRuntime(WorldRuntimeConfig config);

  [[nodiscard]] WorldRuntimeError request(const ChunkIdentity& chunk);
  [[nodiscard]] WorldRuntimeError set_simulation_lod(const ChunkIdentity& chunk, SimulationLod lod);
  [[nodiscard]] WorldAdvance advance();
  [[nodiscard]] WorldInspection inspect() const;
  [[nodiscard]] std::uint64_t world_hash() const noexcept;

 private:
  WorldRuntimeConfig config_;
  std::uint64_t tick_{0U};
  std::uint64_t next_sequence_{1U};
  ChunkRegistry chunks_;
  JobQueue completed_;
  std::vector<ScheduledWorldJob> pending_;
  SimulationLodScheduler simulation_;

  void schedule(JobKind kind, const ChunkIdentity& chunk, std::uint32_t steps);
  [[nodiscard]] WorldRuntimeError apply(const JobResult& result);
};

}  // namespace ludivra::kernel
