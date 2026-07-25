#pragma once

#include "world_chunks.hpp"

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

/// Samples per chunk edge. The grid is inclusive on both edges, so the boundary a
/// chunk shares with its neighbour is sampled by both and can be compared.
inline constexpr std::int32_t chunk_sample_edge = 33;  // chunk_extent_units + 1

/**
 * Generated content of one chunk: a height field in the declared fixed-point
 * scale. It is derived data, never stored: the identity reproduces it.
 */
struct ChunkSamples final {
  ChunkIdentity identity;
  /// Row-major heights, `chunk_sample_edge * chunk_sample_edge` values in milli.
  std::vector<std::int64_t> height;
};

/**
 * Generates a chunk from its identity alone.
 *
 * The signature is the enforcement: the generator receives no registry, no clock
 * and no neighbour, so it cannot depend on load order even by accident. Terrain is
 * sampled from **global** coordinates rather than from a per-chunk random stream,
 * which is what makes two neighbours agree on the edge they share; per-chunk
 * streams remain the right tool for per-chunk decisions, not for continuous fields.
 */
[[nodiscard]] ChunkSamples generate_chunk(std::uint64_t root_seed, const ChunkIdentity& identity);

[[nodiscard]] std::uint64_t chunk_content_hash(const ChunkSamples& samples) noexcept;

enum class GeneratorCheck : std::uint8_t {
  none,
  non_deterministic,
  seam_detected
};

/// Generates the same chunk twice and reports whether the results differ.
[[nodiscard]] GeneratorCheck verify_generator_determinism(
    std::uint64_t root_seed,
    const ChunkIdentity& identity);

/// Compares the shared edge of two chunks adjacent on the x or z axis.
[[nodiscard]] GeneratorCheck verify_chunk_seam(
    const ChunkSamples& left,
    const ChunkSamples& right);

}  // namespace ludivra::kernel
