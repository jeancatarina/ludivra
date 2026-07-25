#pragma once

#include <cstdint>

namespace ludivra::kernel {

/// Failure of a fixed-point operation. Saturation is never a result: a value that
/// does not fit is an error, because silently clamping would hide a rule defect.
enum class FixedError : std::uint8_t {
  none,
  overflow,
  divide_by_zero,
  scale_unsupported
};

struct FixedResult final {
  std::int64_t value;
  FixedError error;
};

/// Largest power-of-ten scale that keeps the widened intermediate exact.
inline constexpr std::uint8_t max_fixed_scale = 9;

/// Default scale of the authoritative path: three decimal places, the `milli`
/// convention the manifest declares explicitly instead of implying by field name.
inline constexpr std::uint8_t default_fixed_scale = 3;

[[nodiscard]] FixedResult fixed_add(std::int64_t left, std::int64_t right) noexcept;
[[nodiscard]] FixedResult fixed_subtract(std::int64_t left, std::int64_t right) noexcept;

/// Product of two values sharing one scale, rounded half away from zero.
[[nodiscard]] FixedResult fixed_multiply(std::int64_t left, std::int64_t right, std::uint8_t scale) noexcept;

/// Quotient of two values sharing one scale, rounded half away from zero.
[[nodiscard]] FixedResult fixed_divide(std::int64_t left, std::int64_t right, std::uint8_t scale) noexcept;

/// Converts a value between declared scales. Crossing scales without this is the
/// defect the declared-scale rule exists to prevent.
[[nodiscard]] FixedResult fixed_rescale(std::int64_t value, std::uint8_t from, std::uint8_t to) noexcept;

}  // namespace ludivra::kernel
