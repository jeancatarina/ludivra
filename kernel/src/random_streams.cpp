#include "random_streams.hpp"

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t golden_gamma = 0x9e3779b97f4a7c15ULL;
constexpr std::uint64_t fnv_offset = 0xcbf29ce484222325ULL;
constexpr std::uint64_t fnv_prime = 0x100000001b3ULL;

std::uint64_t split_mix64(std::uint64_t& seed) noexcept {
  seed += golden_gamma;
  std::uint64_t value = seed;
  value = (value ^ (value >> 30U)) * 0xbf58476d1ce4e5b9ULL;
  value = (value ^ (value >> 27U)) * 0x94d049bb133111ebULL;
  return value ^ (value >> 31U);
}

std::uint64_t rotate_left(const std::uint64_t value, const unsigned count) noexcept {
  return (value << count) | (value >> (64U - count));
}

}  // namespace

std::uint64_t random_domain_hash(const std::string_view domain) noexcept {
  std::uint64_t hash = fnv_offset;
  for (const char character : domain) {
    hash ^= static_cast<std::uint64_t>(static_cast<unsigned char>(character));
    hash *= fnv_prime;
  }
  return hash;
}

RandomStream RandomStream::derive(
    const std::uint64_t root_seed,
    const std::string_view domain,
    const std::uint64_t instance) noexcept {
  std::uint64_t seed = root_seed ^ random_domain_hash(domain) ^ (instance * golden_gamma);
  RandomStream stream;
  stream.state_.s0 = split_mix64(seed);
  stream.state_.s1 = split_mix64(seed);
  stream.state_.s2 = split_mix64(seed);
  stream.state_.s3 = split_mix64(seed);
  stream.state_.draws = 0U;
  return stream;
}

RandomStream RandomStream::restore(const RandomStreamState state) noexcept {
  RandomStream stream;
  stream.state_ = state;
  return stream;
}

std::uint64_t RandomStream::next_u64() noexcept {
  const std::uint64_t result = rotate_left(state_.s0 + state_.s3, 23U) + state_.s0;
  const std::uint64_t t = state_.s1 << 17U;
  state_.s2 ^= state_.s0;
  state_.s3 ^= state_.s1;
  state_.s1 ^= state_.s2;
  state_.s0 ^= state_.s3;
  state_.s2 ^= t;
  state_.s3 = rotate_left(state_.s3, 45U);
  state_.draws += 1U;
  return result;
}

std::int64_t RandomStream::range(const std::int64_t minimum, const std::int64_t maximum) noexcept {
  if (maximum <= minimum) return minimum;
  const std::uint64_t span = static_cast<std::uint64_t>(maximum) - static_cast<std::uint64_t>(minimum) + 1ULL;
  if (span == 0U) return static_cast<std::int64_t>(next_u64());

  // Reject the tail that would make low values more likely than high ones.
  const std::uint64_t limit = std::uint64_t{0} - (std::uint64_t{0} - span) % span;
  std::uint64_t draw = next_u64();
  while (limit != 0U && draw >= limit) draw = next_u64();
  return static_cast<std::int64_t>(static_cast<std::uint64_t>(minimum) + (draw % span));
}

const RandomStreamState& RandomStream::state() const noexcept {
  return state_;
}

RandomStreamRegistry::RandomStreamRegistry(const std::uint64_t root_seed) noexcept : root_seed_(root_seed) {}

RandomStream& RandomStreamRegistry::stream(const std::string_view domain, const std::uint64_t instance) {
  const auto key = std::make_pair(std::string(domain), instance);
  const auto found = streams_.find(key);
  if (found != streams_.end()) return found->second;
  const auto inserted = streams_.emplace(key, RandomStream::derive(root_seed_, domain, instance));
  return inserted.first->second;
}

std::vector<NamedRandomStream> RandomStreamRegistry::snapshot() const {
  std::vector<NamedRandomStream> streams;
  streams.reserve(streams_.size());
  for (const auto& [key, stream] : streams_) {
    streams.push_back({key.first, key.second, stream.state()});
  }
  return streams;
}

void RandomStreamRegistry::restore(const std::vector<NamedRandomStream>& streams) {
  streams_.clear();
  for (const auto& entry : streams) {
    streams_.emplace(std::make_pair(entry.domain, entry.instance), RandomStream::restore(entry.state));
  }
}

void RandomStreamRegistry::reset(const std::uint64_t root_seed) noexcept {
  root_seed_ = root_seed;
  streams_.clear();
}

}  // namespace ludivra::kernel
