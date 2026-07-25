#pragma once

#include <cstdint>
#include <map>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace ludivra::kernel {

/// State of one PRNG stream. It is part of the authoritative state: replay restores
/// it, and the hash covers it, so consuming a draw out of order is detectable.
struct RandomStreamState final {
  std::uint64_t s0;
  std::uint64_t s1;
  std::uint64_t s2;
  std::uint64_t s3;
  std::uint64_t draws;
};

/// Domain-separated PRNG, per ADR 0018: SplitMix64 derives the state and
/// xoshiro256++ produces the sequence. Adding a system, a chunk or an agent never
/// shifts the numbers of an existing stream, because the domain name and the
/// instance are part of the derivation instead of a shared global counter.
class RandomStream final {
 public:
  static RandomStream derive(std::uint64_t root_seed, std::string_view domain, std::uint64_t instance) noexcept;
  static RandomStream restore(RandomStreamState state) noexcept;

  [[nodiscard]] std::uint64_t next_u64() noexcept;

  /// Inclusive range using rejection sampling. Modulo would bias any range that
  /// does not divide 2^64, which is every interesting range.
  [[nodiscard]] std::int64_t range(std::int64_t minimum, std::int64_t maximum) noexcept;

  [[nodiscard]] const RandomStreamState& state() const noexcept;

 private:
  RandomStreamState state_{};
};

/// FNV-1a over the domain name. Names, not numbers, identify a domain, so a stream
/// keeps its sequence when unrelated streams are added or removed.
[[nodiscard]] std::uint64_t random_domain_hash(std::string_view domain) noexcept;

/// One stream as it travels through save, replay and hash.
struct NamedRandomStream final {
  std::string domain;
  std::uint64_t instance;
  RandomStreamState state;
};

/// Streams owned by a runtime. Derivation is a pure function of root seed, domain
/// and instance, so creating a stream on first use is deterministic and needs no
/// declaration step; the ordered registry is what makes hashing and saving stable.
class RandomStreamRegistry final {
 public:
  explicit RandomStreamRegistry(std::uint64_t root_seed) noexcept;

  [[nodiscard]] RandomStream& stream(std::string_view domain, std::uint64_t instance);
  [[nodiscard]] std::vector<NamedRandomStream> snapshot() const;
  void restore(const std::vector<NamedRandomStream>& streams);
  void reset(std::uint64_t root_seed) noexcept;

 private:
  std::uint64_t root_seed_;
  std::map<std::pair<std::string, std::uint64_t>, RandomStream> streams_;
};

}  // namespace ludivra::kernel
