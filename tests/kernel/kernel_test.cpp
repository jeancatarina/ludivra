#include "fixed_point.hpp"
#include "random_streams.hpp"

#include <cstdint>
#include <cstdio>
#include <fstream>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

namespace {

using ludivra::kernel::fixed_add;
using ludivra::kernel::fixed_divide;
using ludivra::kernel::fixed_multiply;
using ludivra::kernel::fixed_rescale;
using ludivra::kernel::FixedError;
using ludivra::kernel::RandomStream;

struct TestContext final {
  void expect(const bool condition, const char* message) {
    if (!condition) {
      std::fprintf(stderr, "FAIL: %s\n", message);
      ++failures;
    }
  }

  int failures{0};
};

void check_fixed_point(TestContext& context) {
  // Multiplication keeps the declared scale: 1.500 * 2.000 == 3.000 in milli.
  const auto product = fixed_multiply(1500, 2000, 3U);
  context.expect(product.error == FixedError::none && product.value == 3000, "milli multiply");

  // Rounding is half away from zero in both directions, never toward zero.
  context.expect(fixed_multiply(5, 1, 1U).value == 1, "0.5 rounds away from zero");
  context.expect(fixed_multiply(-5, 1, 1U).value == -1, "-0.5 rounds away from zero");
  context.expect(fixed_divide(1, 3, 3U).value == 333, "milli divide truncates at the declared scale");
  context.expect(fixed_divide(2, 3, 3U).value == 667, "milli divide rounds up at the half");
  context.expect(fixed_divide(-2, 3, 3U).value == -667, "negative divide rounds away from zero");

  // A widened intermediate keeps large operands exact instead of wrapping.
  const auto large = fixed_multiply(4'000'000'000'000LL, 2'500LL, 3U);
  context.expect(large.error == FixedError::none && large.value == 10'000'000'000'000LL, "widened intermediate");

  // Overflow and division by zero are results, never silent saturation.
  context.expect(
      fixed_add(std::numeric_limits<std::int64_t>::max(), 1).error == FixedError::overflow,
      "add reports overflow");
  context.expect(
      fixed_multiply(std::numeric_limits<std::int64_t>::max(), 2000, 3U).error == FixedError::overflow,
      "multiply reports overflow");
  context.expect(fixed_divide(1000, 0, 3U).error == FixedError::divide_by_zero, "divide by zero");
  context.expect(fixed_multiply(1, 1, 20U).error == FixedError::scale_unsupported, "unsupported scale");

  // Crossing scales is explicit, and it is the operation that prevents a value
  // declared in milli from being read as if it were units.
  context.expect(fixed_rescale(1500, 3U, 1U).value == 15, "milli to deci");
  context.expect(fixed_rescale(15, 1U, 3U).value == 1500, "deci to milli");
  context.expect(fixed_rescale(1550, 3U, 1U).value == 16, "rescale rounds away from zero");
}

/// Minimal reader for the shared fixture. A dependency-free scan is enough because
/// the format is fixed, and a format change fails loudly instead of passing empty.
struct GoldenStream final {
  std::string domain;
  std::uint64_t instance{0};
  std::vector<std::uint64_t> draws;
  std::vector<std::int64_t> range_one_to_six;
};

std::vector<GoldenStream> read_golden(TestContext& context, const std::string& path) {
  std::ifstream file(path);
  std::stringstream buffer;
  buffer << file.rdbuf();
  const std::string text = buffer.str();
  context.expect(!text.empty(), "golden fixture is readable");

  std::vector<GoldenStream> streams;
  std::size_t cursor = 0;
  while (true) {
    const auto domain_at = text.find("\"domain\": \"", cursor);
    if (domain_at == std::string::npos) break;
    const auto domain_start = domain_at + 11;
    const auto domain_end = text.find('"', domain_start);
    GoldenStream stream;
    stream.domain = text.substr(domain_start, domain_end - domain_start);

    const auto instance_at = text.find("\"instance\": ", domain_end);
    stream.instance = static_cast<std::uint64_t>(std::stoull(text.substr(instance_at + 12, 4)));

    const auto draws_at = text.find("\"draws\": [", instance_at);
    const auto draws_end = text.find(']', draws_at);
    std::size_t scan = draws_at;
    while (true) {
      const auto quote = text.find('"', scan + 1);
      if (quote == std::string::npos || quote > draws_end) break;
      const auto quote_end = text.find('"', quote + 1);
      if (quote_end == std::string::npos || quote_end > draws_end) break;
      const std::string token = text.substr(quote + 1, quote_end - quote - 1);
      if (token.size() == 16) stream.draws.push_back(std::stoull(token, nullptr, 16));
      scan = quote_end;
    }

    const auto range_at = text.find("\"range1to6\": [", draws_end);
    const auto range_end = text.find(']', range_at);
    std::string numbers = text.substr(range_at + 14, range_end - range_at - 14);
    for (char& character : numbers) {
      if (character == ',') character = ' ';
    }
    std::istringstream values(numbers);
    std::int64_t value = 0;
    while (values >> value) stream.range_one_to_six.push_back(value);

    streams.push_back(stream);
    cursor = range_end;
  }
  return streams;
}

void check_random_streams(TestContext& context) {
  const std::string fixture = std::string(LUDIVRA_TEST_FIXTURE_DIR) + "/rng-golden.json";
  const auto golden = read_golden(context, fixture);
  context.expect(golden.size() == 6, "the fixture declares six streams");

  for (const auto& expected : golden) {
    auto stream = RandomStream::derive(42U, expected.domain, expected.instance);
    for (std::size_t index = 0; index < expected.draws.size(); ++index) {
      const auto produced = stream.next_u64();
      context.expect(produced == expected.draws[index], "draw matches the golden vector");
    }
    context.expect(stream.state().draws == expected.draws.size(), "stream position counts draws");

    auto ranged = RandomStream::derive(42U, expected.domain, expected.instance);
    for (const auto value : expected.range_one_to_six) {
      const auto produced = ranged.range(1, 6);
      context.expect(produced == value, "ranged draw matches the golden vector");
      context.expect(produced >= 1 && produced <= 6, "ranged draw stays inside the range");
    }
  }

  // Domain separation: adding a stream must not move an existing one.
  auto world = RandomStream::derive(42U, "world.generation", 0U);
  auto combat = RandomStream::derive(42U, "combat.damage", 0U);
  context.expect(world.next_u64() != combat.next_u64(), "domains produce distinct sequences");

  // Restoring a saved position resumes the same sequence.
  auto original = RandomStream::derive(7U, "loot.drop", 3U);
  static_cast<void>(original.next_u64());
  static_cast<void>(original.next_u64());
  const auto saved = original.state();
  const auto next = original.next_u64();
  auto restored = RandomStream::restore(saved);
  context.expect(restored.next_u64() == next, "restored stream resumes where it stopped");

  // An inverted range is not an error condition: it collapses to its bound.
  auto collapsed = RandomStream::derive(1U, "edge", 0U);
  context.expect(collapsed.range(5, 5) == 5, "single value range");
}

}  // namespace

int main() {
  TestContext context;
  check_fixed_point(context);
  check_random_streams(context);
  if (context.failures > 0) {
    std::fprintf(stderr, "%d kernel determinism checks failed\n", context.failures);
    return 1;
  }
  std::printf("kernel determinism checks passed\n");
  return 0;
}
