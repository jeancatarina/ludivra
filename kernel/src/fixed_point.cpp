#include "fixed_point.hpp"

#include <limits>

namespace ludivra::kernel {
namespace {

constexpr std::int64_t scale_units[] = {
    1LL,
    10LL,
    100LL,
    1'000LL,
    10'000LL,
    100'000LL,
    1'000'000LL,
    10'000'000LL,
    100'000'000LL,
    1'000'000'000LL};

/// Unsigned 128-bit product built from 64-bit halves. Exact integer arithmetic is
/// exact on every compiler, so the portable path and a native 128-bit type produce
/// the same bits; no compiler-specific intrinsic enters the authoritative result.
struct UnsignedPair final {
  std::uint64_t high;
  std::uint64_t low;
};

UnsignedPair multiply_unsigned(const std::uint64_t left, const std::uint64_t right) noexcept {
  const std::uint64_t left_low = left & 0xffffffffULL;
  const std::uint64_t left_high = left >> 32U;
  const std::uint64_t right_low = right & 0xffffffffULL;
  const std::uint64_t right_high = right >> 32U;

  const std::uint64_t low_low = left_low * right_low;
  const std::uint64_t cross_a = left_high * right_low;
  const std::uint64_t cross_b = left_low * right_high;
  const std::uint64_t high_high = left_high * right_high;

  const std::uint64_t middle = (low_low >> 32U) + (cross_a & 0xffffffffULL) + (cross_b & 0xffffffffULL);
  const std::uint64_t low = (middle << 32U) | (low_low & 0xffffffffULL);
  const std::uint64_t high = high_high + (cross_a >> 32U) + (cross_b >> 32U) + (middle >> 32U);
  return {high, low};
}

/// Divides a 128-bit unsigned value by a 64-bit divisor using restoring division.
/// Returns false when the quotient would not fit in 64 bits.
bool divide_unsigned(const UnsignedPair numerator, const std::uint64_t divisor, std::uint64_t& quotient, std::uint64_t& remainder) noexcept {
  if (divisor == 0U) return false;
  if (numerator.high >= divisor) return false;

  std::uint64_t result = 0U;
  std::uint64_t rest = numerator.high;
  for (int bit = 63; bit >= 0; --bit) {
    const std::uint64_t next_bit = (numerator.low >> static_cast<unsigned>(bit)) & 1ULL;
    // `rest` stays below `divisor`, so shifting it left never overflows.
    rest = (rest << 1U) | next_bit;
    if (rest >= divisor) {
      rest -= divisor;
      result |= (1ULL << static_cast<unsigned>(bit));
    }
  }
  quotient = result;
  remainder = rest;
  return true;
}

std::uint64_t magnitude(const std::int64_t value) noexcept {
  return value < 0 ? (~static_cast<std::uint64_t>(value) + 1ULL) : static_cast<std::uint64_t>(value);
}

FixedResult from_magnitude(const std::uint64_t value, const bool negative) noexcept {
  constexpr std::uint64_t positive_limit = static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max());
  if (negative) {
    if (value > positive_limit + 1ULL) return {0, FixedError::overflow};
    if (value == positive_limit + 1ULL) return {std::numeric_limits<std::int64_t>::min(), FixedError::none};
    return {-static_cast<std::int64_t>(value), FixedError::none};
  }
  if (value > positive_limit) return {0, FixedError::overflow};
  return {static_cast<std::int64_t>(value), FixedError::none};
}

bool scale_supported(const std::uint8_t scale) noexcept {
  return scale <= max_fixed_scale;
}

}  // namespace

FixedResult fixed_add(const std::int64_t left, const std::int64_t right) noexcept {
  if ((right > 0 && left > std::numeric_limits<std::int64_t>::max() - right) ||
      (right < 0 && left < std::numeric_limits<std::int64_t>::min() - right)) {
    return {0, FixedError::overflow};
  }
  return {left + right, FixedError::none};
}

FixedResult fixed_subtract(const std::int64_t left, const std::int64_t right) noexcept {
  if (right == std::numeric_limits<std::int64_t>::min()) {
    if (left < 0) return {0, FixedError::overflow};
    return fixed_add(left, std::numeric_limits<std::int64_t>::max());
  }
  return fixed_add(left, -right);
}

FixedResult fixed_multiply(const std::int64_t left, const std::int64_t right, const std::uint8_t scale) noexcept {
  if (!scale_supported(scale)) return {0, FixedError::scale_unsupported};
  const std::uint64_t unit = static_cast<std::uint64_t>(scale_units[scale]);
  const bool negative = (left < 0) != (right < 0);
  const UnsignedPair product = multiply_unsigned(magnitude(left), magnitude(right));

  // Round half away from zero, the rule declared by ADR 0018.
  const std::uint64_t half = unit / 2U;
  UnsignedPair rounded = product;
  rounded.low += half;
  if (rounded.low < product.low) rounded.high += 1U;

  std::uint64_t quotient = 0U;
  std::uint64_t remainder = 0U;
  if (!divide_unsigned(rounded, unit, quotient, remainder)) return {0, FixedError::overflow};
  return from_magnitude(quotient, negative);
}

FixedResult fixed_divide(const std::int64_t left, const std::int64_t right, const std::uint8_t scale) noexcept {
  if (!scale_supported(scale)) return {0, FixedError::scale_unsupported};
  if (right == 0) return {0, FixedError::divide_by_zero};
  const std::uint64_t unit = static_cast<std::uint64_t>(scale_units[scale]);
  const bool negative = (left < 0) != (right < 0);
  const std::uint64_t divisor = magnitude(right);
  const UnsignedPair scaled = multiply_unsigned(magnitude(left), unit);

  std::uint64_t quotient = 0U;
  std::uint64_t remainder = 0U;
  if (!divide_unsigned(scaled, divisor, quotient, remainder)) return {0, FixedError::overflow};
  // Half away from zero: promote when twice the remainder reaches the divisor.
  if (remainder >= divisor - remainder) {
    if (quotient == std::numeric_limits<std::uint64_t>::max()) return {0, FixedError::overflow};
    quotient += 1U;
  }
  return from_magnitude(quotient, negative);
}

FixedResult fixed_rescale(const std::int64_t value, const std::uint8_t from, const std::uint8_t to) noexcept {
  if (!scale_supported(from) || !scale_supported(to)) return {0, FixedError::scale_unsupported};
  if (from == to) return {value, FixedError::none};
  if (to > from) {
    const std::uint8_t difference = static_cast<std::uint8_t>(to - from);
    return fixed_multiply(value, scale_units[difference], 0U);
  }
  const std::uint8_t difference = static_cast<std::uint8_t>(from - to);
  return fixed_divide(value, scale_units[difference], 0U);
}

}  // namespace ludivra::kernel
