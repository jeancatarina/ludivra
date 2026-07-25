#include "world_generator.hpp"

#include "world_position.hpp"

#include <cstdint>

namespace ludivra::kernel {
namespace {

constexpr std::uint64_t fnv_offset = 0xcbf29ce484222325ULL;
constexpr std::uint64_t fnv_prime = 0x100000001b3ULL;

/// Milli is the declared scale of the height field, per ADR 0018.
constexpr std::int64_t unit = 1'000;

struct Octave final {
  std::int32_t period_units;
  std::int64_t amplitude_milli;
};

/// Coarse to fine. Fixed here rather than randomised, because a generator version
/// is part of the chunk identity: changing these numbers is a new world, and the
/// version has to say so.
constexpr Octave octaves[] = {{64, 6'000}, {32, 3'000}, {16, 1'500}, {8, 700}};

void mix(std::uint64_t& hash, const std::uint64_t value) noexcept {
  for (std::uint32_t shift = 0; shift < 64; shift += 8) {
    hash ^= static_cast<std::uint8_t>((value >> shift) & 0xFFU);
    hash *= fnv_prime;
  }
}

/// Value of one lattice corner, in milli, from global lattice coordinates. Only the
/// coordinates enter, so both neighbours of an edge compute the same corner.
std::int64_t lattice_value(
    const std::uint64_t root_seed,
    const std::uint32_t generator_id,
    const std::uint32_t generator_version,
    const std::uint16_t dimension,
    const std::int64_t lattice_x,
    const std::int64_t lattice_z,
    const std::int32_t period) noexcept {
  std::uint64_t hash = fnv_offset;
  mix(hash, root_seed);
  mix(hash, generator_id);
  mix(hash, generator_version);
  mix(hash, dimension);
  mix(hash, static_cast<std::uint64_t>(lattice_x));
  mix(hash, static_cast<std::uint64_t>(lattice_z));
  mix(hash, static_cast<std::uint64_t>(period));
  // Map to [-unit, unit] without modulo bias mattering: the value is a field
  // sample, not a draw from a declared stream.
  return static_cast<std::int64_t>(hash % static_cast<std::uint64_t>(2 * unit + 1)) - unit;
}

/// Smoothstep in milli, using only exact integer operations.
std::int64_t smooth(const std::int64_t weight) noexcept {
  const std::int64_t squared = (weight * weight) / unit;
  const std::int64_t cubed = (squared * weight) / unit;
  return 3 * squared - 2 * cubed;
}

std::int64_t interpolate(const std::int64_t from, const std::int64_t to, const std::int64_t weight) noexcept {
  return from + ((to - from) * weight) / unit;
}

/// Floor division, so a lattice cell west of the origin is the cell it should be.
std::int64_t floor_divide(const std::int64_t value, const std::int64_t divisor) noexcept {
  const std::int64_t quotient = value / divisor;
  return (value % divisor != 0 && ((value % divisor < 0) != (divisor < 0))) ? quotient - 1 : quotient;
}

std::int64_t sample_height(
    const std::uint64_t root_seed,
    const ChunkIdentity& identity,
    const std::int64_t global_x,
    const std::int64_t global_z) noexcept {
  std::int64_t height = 0;
  for (const auto& octave : octaves) {
    const std::int64_t period = octave.period_units;
    const std::int64_t cell_x = floor_divide(global_x, period);
    const std::int64_t cell_z = floor_divide(global_z, period);
    const std::int64_t offset_x = global_x - cell_x * period;
    const std::int64_t offset_z = global_z - cell_z * period;
    const std::int64_t weight_x = smooth((offset_x * unit) / period);
    const std::int64_t weight_z = smooth((offset_z * unit) / period);

    const auto corner = [&](const std::int64_t step_x, const std::int64_t step_z) {
      return lattice_value(
          root_seed,
          identity.generator_id,
          identity.generator_version,
          identity.dimension,
          cell_x + step_x,
          cell_z + step_z,
          octave.period_units);
    };
    const std::int64_t top = interpolate(corner(0, 0), corner(1, 0), weight_x);
    const std::int64_t bottom = interpolate(corner(0, 1), corner(1, 1), weight_x);
    height += (interpolate(top, bottom, weight_z) * octave.amplitude_milli) / unit;
  }
  return height;
}

}  // namespace

ChunkSamples generate_chunk(const std::uint64_t root_seed, const ChunkIdentity& identity) {
  ChunkSamples samples{identity, {}};
  samples.height.resize(static_cast<std::size_t>(chunk_sample_edge) * chunk_sample_edge);
  const std::int64_t origin_x = static_cast<std::int64_t>(identity.x) * chunk_extent_units;
  const std::int64_t origin_z = static_cast<std::int64_t>(identity.z) * chunk_extent_units;

  for (std::int32_t row = 0; row < chunk_sample_edge; ++row) {
    for (std::int32_t column = 0; column < chunk_sample_edge; ++column) {
      const std::int64_t global_x = origin_x + column;
      const std::int64_t global_z = origin_z + row;
      samples.height[static_cast<std::size_t>(row) * chunk_sample_edge + column] =
          sample_height(root_seed, identity, global_x, global_z);
    }
  }
  return samples;
}

std::uint64_t chunk_content_hash(const ChunkSamples& samples) noexcept {
  std::uint64_t hash = fnv_offset;
  mix(hash, samples.identity.dimension);
  mix(hash, static_cast<std::uint64_t>(samples.identity.x));
  mix(hash, static_cast<std::uint64_t>(samples.identity.z));
  mix(hash, samples.identity.generator_version);
  for (const auto value : samples.height) mix(hash, static_cast<std::uint64_t>(value));
  return hash;
}

GeneratorCheck verify_generator_determinism(const std::uint64_t root_seed, const ChunkIdentity& identity) {
  const auto first = generate_chunk(root_seed, identity);
  const auto second = generate_chunk(root_seed, identity);
  return chunk_content_hash(first) == chunk_content_hash(second)
      ? GeneratorCheck::none
      : GeneratorCheck::non_deterministic;
}

GeneratorCheck verify_chunk_seam(const ChunkSamples& left, const ChunkSamples& right) {
  const bool east = right.identity.x == left.identity.x + 1 && right.identity.z == left.identity.z;
  const bool south = right.identity.z == left.identity.z + 1 && right.identity.x == left.identity.x;
  if (left.identity.dimension != right.identity.dimension || (!east && !south)) {
    return GeneratorCheck::seam_detected;
  }
  for (std::int32_t index = 0; index < chunk_sample_edge; ++index) {
    const std::size_t left_index = east
        ? static_cast<std::size_t>(index) * chunk_sample_edge + (chunk_sample_edge - 1)
        : static_cast<std::size_t>(chunk_sample_edge - 1) * chunk_sample_edge + index;
    const std::size_t right_index = east
        ? static_cast<std::size_t>(index) * chunk_sample_edge
        : static_cast<std::size_t>(index);
    if (left.height[left_index] != right.height[right_index]) return GeneratorCheck::seam_detected;
  }
  return GeneratorCheck::none;
}

}  // namespace ludivra::kernel
