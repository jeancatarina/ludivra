#include "world_runtime.hpp"

#include "world_generator.hpp"

#include <algorithm>
#include <limits>
#include <tuple>

namespace ludivra::kernel {
namespace {

std::uint64_t cadence(const SimulationLod lod) noexcept {
  switch (lod) {
    case SimulationLod::active: return 1U;
    case SimulationLod::simplified: return 2U;
    case SimulationLod::aggregated: return 8U;
    case SimulationLod::unloaded: return std::numeric_limits<std::uint64_t>::max();
  }
  return std::numeric_limits<std::uint64_t>::max();
}

bool ordered(const ScheduledWorldJob& left, const ScheduledWorldJob& right) noexcept {
  return std::tie(left.kind, left.chunk.dimension, left.chunk.x, left.chunk.y, left.chunk.z, left.sequence) <
      std::tie(right.kind, right.chunk.dimension, right.chunk.x, right.chunk.y, right.chunk.z, right.sequence);
}

void mix(std::uint64_t& hash, const std::uint64_t value) noexcept {
  constexpr std::uint64_t prime = 0x100000001b3ULL;
  for (std::uint32_t shift = 0U; shift < 64U; shift += 8U) {
    hash ^= static_cast<std::uint8_t>((value >> shift) & 0xFFU);
    hash *= prime;
  }
}

}  // namespace

void SimulationLodScheduler::set(const ChunkIdentity chunk, const SimulationLod lod, const std::uint64_t tick) {
  records_.insert_or_assign(chunk, SimulationLodRecord{chunk, lod, tick});
}

void SimulationLodScheduler::erase(const ChunkIdentity& chunk) {
  records_.erase(chunk);
}

std::vector<SimulationCatchUp> SimulationLodScheduler::advance(const std::uint64_t tick) {
  std::vector<SimulationCatchUp> updates;
  for (auto& [chunk, record] : records_) {
    if (record.lod == SimulationLod::unloaded || tick <= record.last_tick) continue;
    const auto elapsed = tick - record.last_tick;
    if (elapsed < cadence(record.lod)) continue;
    updates.push_back({chunk, record.lod, elapsed});
    record.last_tick = tick;
  }
  return updates;
}

std::vector<SimulationLodRecord> SimulationLodScheduler::snapshot() const {
  std::vector<SimulationLodRecord> records;
  records.reserve(records_.size());
  for (const auto& [chunk, record] : records_) records.push_back(record);
  return records;
}

WorldRuntime::WorldRuntime(const WorldRuntimeConfig config) : config_(config) {}

void WorldRuntime::schedule(const JobKind kind, const ChunkIdentity& chunk, const std::uint32_t steps) {
  pending_.push_back({kind, chunk, next_sequence_++, steps});
}

WorldRuntimeError WorldRuntime::request(const ChunkIdentity& chunk) {
  if (config_.job_steps_per_tick == 0U || config_.generation_steps == 0U || config_.mesh_steps == 0U) {
    return WorldRuntimeError::configuration_invalid;
  }
  if (chunks_.request(chunk) != ChunkError::none || chunks_.transition(chunk, ChunkState::generating) != ChunkError::none) {
    return WorldRuntimeError::chunk_error;
  }
  schedule(JobKind::generate, chunk, config_.generation_steps);
  return WorldRuntimeError::none;
}

WorldRuntimeError WorldRuntime::set_simulation_lod(const ChunkIdentity& chunk, const SimulationLod lod) {
  if (chunks_.state(chunk) == ChunkState::unloaded) return WorldRuntimeError::chunk_error;
  simulation_.set(chunk, lod, tick_);
  return WorldRuntimeError::none;
}

WorldRuntimeError WorldRuntime::apply(const JobResult& result) {
  switch (result.kind) {
    case JobKind::generate:
      if (chunks_.state(result.chunk) != ChunkState::generating ||
          chunks_.set_content_hash(result.chunk, result.payload_hash) != ChunkError::none ||
          chunks_.transition(result.chunk, ChunkState::ready_for_mesh) != ChunkError::none ||
          chunks_.transition(result.chunk, ChunkState::meshing) != ChunkError::none) {
        return WorldRuntimeError::chunk_error;
      }
      schedule(JobKind::mesh, result.chunk, config_.mesh_steps);
      return WorldRuntimeError::none;
    case JobKind::mesh:
      return chunks_.state(result.chunk) == ChunkState::meshing &&
              chunks_.transition(result.chunk, ChunkState::resident) == ChunkError::none
          ? WorldRuntimeError::none
          : WorldRuntimeError::chunk_error;
    case JobKind::path:
    case JobKind::compress:
    case JobKind::io:
      return WorldRuntimeError::none;
  }
  return WorldRuntimeError::chunk_error;
}

WorldAdvance WorldRuntime::advance() {
  if (tick_ != std::numeric_limits<std::uint64_t>::max()) ++tick_;
  std::sort(pending_.begin(), pending_.end(), ordered);
  std::vector<ScheduledWorldJob> still_pending;
  still_pending.reserve(pending_.size());
  std::uint32_t budget = config_.job_steps_per_tick;
  for (auto job : pending_) {
    if (budget == 0U) {
      still_pending.push_back(job);
      continue;
    }
    --budget;
    --job.remaining_steps;
    if (job.remaining_steps > 0U) {
      still_pending.push_back(job);
      continue;
    }
    const auto payload_hash = job.kind == JobKind::generate
        ? chunk_content_hash(generate_chunk(config_.root_seed, job.chunk))
        : chunks_.state(job.chunk) == ChunkState::unloaded ? 0U : chunks_.world_hash();
    completed_.submit({job.kind, job.chunk, job.sequence, payload_hash});
  }
  pending_.swap(still_pending);
  auto committed = completed_.commit();
  auto error = WorldRuntimeError::none;
  for (const auto& result : committed) {
    if (error == WorldRuntimeError::none) error = apply(result);
  }
  return {tick_, error, std::move(committed), simulation_.advance(tick_)};
}

WorldInspection WorldRuntime::inspect() const {
  auto pending = pending_;
  std::sort(pending.begin(), pending.end(), ordered);
  return {tick_, chunks_.snapshot(), std::move(pending), simulation_.snapshot()};
}

std::uint64_t WorldRuntime::world_hash() const noexcept {
  std::uint64_t hash = chunks_.world_hash();
  mix(hash, tick_);
  for (const auto& record : simulation_.snapshot()) {
    mix(hash, record.chunk.dimension);
    mix(hash, static_cast<std::uint64_t>(static_cast<std::int64_t>(record.chunk.x)));
    mix(hash, static_cast<std::uint64_t>(static_cast<std::int64_t>(record.chunk.z)));
    mix(hash, static_cast<std::uint64_t>(record.lod));
    mix(hash, record.last_tick);
  }
  return hash;
}

}  // namespace ludivra::kernel
