#include "world_chunks.hpp"

#include "random_streams.hpp"

#include <string>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_offset = 0xcbf29ce484222325ULL;
constexpr std::uint64_t fnv_prime = 0x100000001b3ULL;

void mix(std::uint64_t& hash, const std::uint64_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 64; shift += 8) {
    hash ^= static_cast<std::uint8_t>((value >> shift) & 0xFFU);
    hash *= fnv_prime;
  }
}

}  // namespace

bool operator<(const ChunkIdentity& left, const ChunkIdentity& right) noexcept {
  return left.ordering() < right.ordering();
}

bool operator==(const ChunkIdentity& left, const ChunkIdentity& right) noexcept {
  return left.ordering() == right.ordering();
}

std::uint64_t chunk_seed(const std::uint64_t root_seed, const ChunkIdentity& identity) noexcept {
  // The generator id and version are part of the domain: improving a generator
  // produces a different world instead of silently reinterpreting the old one.
  const std::string domain = "world.chunk." + std::to_string(identity.generator_id) + "." +
      std::to_string(identity.generator_version);
  std::uint64_t instance = fnv_offset;
  mix(instance, identity.dimension);
  mix(instance, static_cast<std::uint64_t>(static_cast<std::int64_t>(identity.x)));
  mix(instance, static_cast<std::uint64_t>(static_cast<std::int64_t>(identity.y)));
  mix(instance, static_cast<std::uint64_t>(static_cast<std::int64_t>(identity.z)));
  return RandomStream::derive(root_seed, domain, instance).next_u64();
}

bool legal_chunk_transition(const ChunkState from, const ChunkState to) noexcept {
  switch (from) {
    case ChunkState::unloaded:
      return to == ChunkState::requested;
    case ChunkState::requested:
      return to == ChunkState::generating || to == ChunkState::unloaded;
    case ChunkState::generating:
      return to == ChunkState::ready_for_mesh || to == ChunkState::unloaded;
    case ChunkState::ready_for_mesh:
      return to == ChunkState::meshing || to == ChunkState::unloaded;
    case ChunkState::meshing:
      return to == ChunkState::resident || to == ChunkState::unloaded;
    case ChunkState::resident:
      return to == ChunkState::dirty || to == ChunkState::evictable || to == ChunkState::saving;
    case ChunkState::dirty:
      return to == ChunkState::saving || to == ChunkState::ready_for_mesh;
    case ChunkState::saving:
      return to == ChunkState::resident || to == ChunkState::evictable;
    case ChunkState::evictable:
      return to == ChunkState::resident || to == ChunkState::unloaded;
  }
  return false;
}

ChunkError ChunkRegistry::request(const ChunkIdentity& identity) {
  const auto found = chunks_.find(identity);
  if (found != chunks_.end()) {
    return legal_chunk_transition(found->second.state, ChunkState::requested)
        ? transition(identity, ChunkState::requested)
        : ChunkError::transition_invalid;
  }
  chunks_.emplace(identity, ChunkRecord{identity, ChunkState::requested, 0U, 0U});
  return ChunkError::none;
}

ChunkError ChunkRegistry::transition(const ChunkIdentity& identity, const ChunkState next) {
  const auto found = chunks_.find(identity);
  if (found == chunks_.end()) return ChunkError::unknown_chunk;
  if (!legal_chunk_transition(found->second.state, next)) return ChunkError::transition_invalid;
  found->second.state = next;
  return ChunkError::none;
}

ChunkError ChunkRegistry::set_content_hash(const ChunkIdentity& identity, const std::uint64_t hash) {
  const auto found = chunks_.find(identity);
  if (found == chunks_.end()) return ChunkError::unknown_chunk;
  found->second.content_hash = hash;
  return ChunkError::none;
}

ChunkError ChunkRegistry::set_resident_resources(const ChunkIdentity& identity, const std::uint32_t count) {
  const auto found = chunks_.find(identity);
  if (found == chunks_.end()) return ChunkError::unknown_chunk;
  found->second.resident_resources = count;
  return ChunkError::none;
}

ChunkError ChunkRegistry::discard(const ChunkIdentity& identity) {
  const auto found = chunks_.find(identity);
  if (found == chunks_.end()) return ChunkError::unknown_chunk;
  if (found->second.state != ChunkState::evictable) return ChunkError::transition_invalid;
  if (found->second.resident_resources != 0U) return ChunkError::leaked_resources;
  chunks_.erase(found);
  return ChunkError::none;
}

ChunkState ChunkRegistry::state(const ChunkIdentity& identity) const noexcept {
  const auto found = chunks_.find(identity);
  return found == chunks_.end() ? ChunkState::unloaded : found->second.state;
}

std::vector<ChunkRecord> ChunkRegistry::snapshot() const {
  std::vector<ChunkRecord> records;
  records.reserve(chunks_.size());
  for (const auto& [identity, record] : chunks_) records.push_back(record);
  return records;
}

std::uint64_t ChunkRegistry::world_hash() const noexcept {
  std::uint64_t hash = fnv_offset;
  for (const auto& [identity, record] : chunks_) {
    mix(hash, identity.dimension);
    mix(hash, static_cast<std::uint64_t>(static_cast<std::int64_t>(identity.x)));
    mix(hash, static_cast<std::uint64_t>(static_cast<std::int64_t>(identity.y)));
    mix(hash, static_cast<std::uint64_t>(static_cast<std::int64_t>(identity.z)));
    mix(hash, identity.generator_version);
    mix(hash, static_cast<std::uint64_t>(record.state));
    mix(hash, record.content_hash);
  }
  return hash;
}

}  // namespace ludivra::kernel
