#include "fixed_point.hpp"
#include "motion_reference.hpp"
#include "mass_reference.hpp"
#include "navigation_reference.hpp"
#include "physics_reference.hpp"
#include "random_streams.hpp"
#include "statechart_runtime.hpp"
#include "world_chunks.hpp"
#include "world_generator.hpp"
#include "world_jobs.hpp"
#include "world_position.hpp"
#include "world_runtime.hpp"
#include "world_streaming.hpp"

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
using ludivra::kernel::chunk_extent_scaled;
using ludivra::kernel::chunk_seed;
using ludivra::kernel::ChunkError;
using ludivra::kernel::ChunkIdentity;
using ludivra::kernel::ChunkRegistry;
using ludivra::kernel::ChunkState;
using ludivra::kernel::chunk_content_hash;
using ludivra::kernel::chunk_sample_edge;
using ludivra::kernel::difference;
using ludivra::kernel::generate_chunk;
using ludivra::kernel::GeneratorCheck;
using ludivra::kernel::verify_chunk_seam;
using ludivra::kernel::plan_streaming;
using ludivra::kernel::StreamingWindow;
using ludivra::kernel::verify_generator_determinism;
using ludivra::kernel::JobKind;
using ludivra::kernel::JobQueue;
using ludivra::kernel::JobResult;
using ludivra::kernel::normalize;
using ludivra::kernel::RandomStream;
using ludivra::kernel::StatechartError;
using ludivra::kernel::StatechartRuntime;
using ludivra::kernel::StatechartState;
using ludivra::kernel::StatechartTransition;
using ludivra::kernel::StatechartTransitionKind;
using ludivra::kernel::same_place;
using ludivra::kernel::translate;
using ludivra::kernel::WorldOffset;
using ludivra::kernel::WorldPosition;
using ludivra::kernel::WorldPositionError;
using ludivra::kernel::WorldRuntime;
using ludivra::kernel::WorldRuntimeConfig;
using ludivra::kernel::WorldRuntimeError;
using ludivra::kernel::SimulationLod;
using ludivra::kernel::AvoidanceAgent;
using ludivra::kernel::NavigationAgentProfile;
using ludivra::kernel::NavigationCell;
using ludivra::kernel::NavigationError;
using ludivra::kernel::NavigationLink;
using ludivra::kernel::NavigationObstacle;
using ludivra::kernel::NavigationPathQuery;
using ludivra::kernel::NavigationRegion;
using ludivra::kernel::ReferenceNavigation;
using ludivra::kernel::ReferenceMotion;
using ludivra::kernel::MotionCancelCause;
using ludivra::kernel::MotionClock;
using ludivra::kernel::MotionDefinition;
using ludivra::kernel::MotionError;
using ludivra::kernel::MotionKind;
using ludivra::kernel::MotionStatus;
using ludivra::kernel::MotionVector;
using ludivra::kernel::RegionalWorld;
using ludivra::kernel::RegionalWorldConfig;
using ludivra::kernel::SpatialEntityLocation;
using ludivra::kernel::SpatialGlobalPosition;
using ludivra::kernel::RegionalWorldError;
using ludivra::kernel::ReferencePhysics;
using ludivra::kernel::PhysicsAuthority;
using ludivra::kernel::PhysicsBodyKind;
using ludivra::kernel::PhysicsBox;
using ludivra::kernel::PhysicsError;
using ludivra::kernel::PhysicsVelocity;
using ludivra::kernel::ReferenceMass;
using ludivra::kernel::MassAgent;
using ludivra::kernel::MassBudget;
using ludivra::kernel::MassError;
using ludivra::kernel::MassLevel;

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

ChunkIdentity chunk_at(const std::int32_t x, const std::int32_t z) {
  return ChunkIdentity{0U, x, 0, z, 1U, 1U};
}

void check_world_position(TestContext& context) {
  // A local coordinate past the chunk edge carries into the chunk coordinate, so
  // every place has exactly one representation.
  const auto carried = normalize(WorldPosition{0U, 0, 0, 0, chunk_extent_scaled + 500, 0, 0});
  context.expect(carried.error == WorldPositionError::none, "normalize succeeds");
  context.expect(carried.value.chunk_x == 1 && carried.value.local_x == 500, "overflow carries east");

  // Truncating division would put this position in chunk zero; flooring is what
  // keeps the chunk west of the origin correct.
  const auto west = normalize(WorldPosition{0U, 0, 0, 0, -1, 0, 0});
  context.expect(west.value.chunk_x == -1, "a negative local lands in the previous chunk");
  context.expect(west.value.local_x == chunk_extent_scaled - 1, "the local part stays positive");

  // Precision does not decay with distance: the same step is exact far away.
  const auto near = translate(WorldPosition{0U, 0, 0, 0, 0, 0, 0}, WorldOffset{1, 0, 0});
  const auto far = translate(WorldPosition{0U, 1'000'000, 0, 0, 0, 0, 0}, WorldOffset{1, 0, 0});
  context.expect(near.value.local_x == 1 && far.value.local_x == 1, "one milli is one milli anywhere");

  WorldOffset offset{};
  const auto measured = difference(
      WorldPosition{0U, 0, 0, 0, 0, 0, 0},
      WorldPosition{0U, 2, 0, 0, 250, 0, 0},
      offset);
  context.expect(measured == WorldPositionError::none, "difference succeeds");
  context.expect(offset.x == 2 * chunk_extent_scaled + 250, "difference spans chunks exactly");
  context.expect(
      difference(WorldPosition{0U, 0, 0, 0, 0, 0, 0}, WorldPosition{1U, 0, 0, 0, 0, 0, 0}, offset) ==
          WorldPositionError::dimension_mismatch,
      "dimensions do not subtract");

  context.expect(
      same_place(WorldPosition{0U, 1, 0, 0, 0, 0, 0}, WorldPosition{0U, 0, 0, 0, chunk_extent_scaled, 0, 0}),
      "the same place compares equal in any representation");
}

void check_chunk_lifecycle(TestContext& context) {
  ChunkRegistry registry;
  const auto identity = chunk_at(4, -7);
  context.expect(registry.state(identity) == ChunkState::unloaded, "an unknown chunk is unloaded");
  context.expect(registry.request(identity) == ChunkError::none, "a chunk can be requested");

  // Skipping generation is a defect, not a shortcut.
  context.expect(
      registry.transition(identity, ChunkState::resident) == ChunkError::transition_invalid,
      "an illegal transition is refused");
  for (const auto next : {ChunkState::generating, ChunkState::ready_for_mesh, ChunkState::meshing, ChunkState::resident}) {
    context.expect(registry.transition(identity, next) == ChunkError::none, "the declared path is allowed");
  }

  context.expect(registry.set_resident_resources(identity, 3U) == ChunkError::none, "resources are tracked");
  context.expect(registry.transition(identity, ChunkState::evictable) == ChunkError::none, "resident can evict");
  context.expect(
      registry.discard(identity) == ChunkError::leaked_resources,
      "a chunk holding resources is not discarded silently");
  context.expect(registry.set_resident_resources(identity, 0U) == ChunkError::none, "resources are released");
  context.expect(registry.discard(identity) == ChunkError::none, "a released chunk is discarded");
  context.expect(registry.state(identity) == ChunkState::unloaded, "the discarded chunk is gone");
  context.expect(registry.transition(identity, ChunkState::resident) == ChunkError::unknown_chunk, "unknown chunk");
}

void check_chunk_seed(TestContext& context) {
  // Generation is a pure function of identity: neighbours and versions differ.
  context.expect(chunk_seed(42U, chunk_at(0, 0)) == chunk_seed(42U, chunk_at(0, 0)), "same identity, same seed");
  context.expect(chunk_seed(42U, chunk_at(0, 0)) != chunk_seed(42U, chunk_at(1, 0)), "neighbours differ");
  context.expect(chunk_seed(42U, chunk_at(0, 0)) != chunk_seed(43U, chunk_at(0, 0)), "root seed matters");
  ChunkIdentity newer = chunk_at(0, 0);
  newer.generator_version = 2U;
  context.expect(chunk_seed(42U, chunk_at(0, 0)) != chunk_seed(42U, newer), "generator version matters");
}

/// Applies results in commit order, which is what a world tick would do.
std::uint64_t apply_results(ChunkRegistry& registry, const std::vector<JobResult>& results) {
  for (const auto& result : results) {
    if (registry.state(result.chunk) == ChunkState::unloaded) {
      static_cast<void>(registry.request(result.chunk));
      static_cast<void>(registry.transition(result.chunk, ChunkState::generating));
      static_cast<void>(registry.transition(result.chunk, ChunkState::ready_for_mesh));
    }
    static_cast<void>(registry.set_content_hash(result.chunk, result.payload_hash));
  }
  return registry.world_hash();
}

void check_job_commit_order(TestContext& context) {
  const std::vector<JobResult> results{
      {JobKind::generate, chunk_at(1, 0), 1U, 0xAAAAULL},
      {JobKind::generate, chunk_at(0, 1), 2U, 0xBBBBULL},
      {JobKind::mesh, chunk_at(0, 0), 3U, 0xCCCCULL},
      {JobKind::generate, chunk_at(0, 0), 4U, 0xDDDDULL},
      {JobKind::io, chunk_at(-1, 0), 5U, 0xEEEEULL}};

  // The same completions in a different order must produce the same world. This is
  // the property that lets jobs run in parallel without breaking replay.
  JobQueue forward;
  for (const auto& result : results) forward.submit(result);
  ChunkRegistry first;
  const auto forward_hash = apply_results(first, forward.commit());

  JobQueue reversed;
  for (auto entry = results.rbegin(); entry != results.rend(); ++entry) reversed.submit(*entry);
  ChunkRegistry second;
  const auto reversed_hash = apply_results(second, reversed.commit());

  JobQueue shuffled;
  for (const auto index : {3U, 0U, 4U, 2U, 1U}) shuffled.submit(results[index]);
  ChunkRegistry third;
  const auto shuffled_hash = apply_results(third, shuffled.commit());

  context.expect(forward_hash == reversed_hash, "reversed completion order produces the same world");
  context.expect(forward_hash == shuffled_hash, "permuted completion order produces the same world");

  JobQueue ordering;
  for (auto entry = results.rbegin(); entry != results.rend(); ++entry) ordering.submit(*entry);
  const auto committed = ordering.commit();
  context.expect(committed.size() == results.size(), "every result is committed once");
  // The declared key is kind first, then dimension and coordinate, then sequence.
  context.expect(committed[0].kind == JobKind::generate && committed[0].chunk.z == 0, "generate (0,0) first");
  context.expect(committed[1].kind == JobKind::generate && committed[1].chunk.z == 1, "then generate (0,1)");
  context.expect(committed[2].kind == JobKind::generate && committed[2].chunk.x == 1, "then generate (1,0)");
  context.expect(committed[3].kind == JobKind::mesh, "mesh commits after every generate");
  context.expect(committed.back().kind == JobKind::io, "io commits last");
  context.expect(ordering.pending() == 0U, "committing drains the queue");
}

void check_cooperative_world_runtime(TestContext& context) {
  const WorldRuntimeConfig config{42U, 1U, 2U, 2U};
  const auto first_chunk = chunk_at(0, 0);
  const auto second_chunk = chunk_at(1, 0);
  WorldRuntime first(config);
  context.expect(first.request(second_chunk) == WorldRuntimeError::none && first.request(first_chunk) == WorldRuntimeError::none,
      "world runtime schedules requested chunks without completing them in the caller");
  auto inspection = first.inspect();
  context.expect(inspection.tick == 0U && inspection.pending_jobs.size() == 2U &&
      inspection.pending_jobs[0].chunk == first_chunk && inspection.pending_jobs[1].chunk == second_chunk,
      "inspection reports sorted pending jobs before their commit boundary");
  context.expect(first.set_simulation_lod(chunk_at(9, 9), SimulationLod::active) == WorldRuntimeError::chunk_error,
      "simulation LOD cannot attach to an unknown chunk");

  const auto first_tick = first.advance();
  context.expect(first_tick.error == WorldRuntimeError::none && first_tick.committed_jobs.empty() && first_tick.tick == 1U,
      "a cooperative job yields instead of blocking the tick");
  const auto generated = first.advance();
  context.expect(generated.error == WorldRuntimeError::none && generated.committed_jobs.size() == 1U &&
      generated.committed_jobs[0].kind == JobKind::generate,
      "generation commits at its deterministic boundary after its declared work units");
  inspection = first.inspect();
  context.expect(inspection.chunks[0].state == ChunkState::meshing && inspection.pending_jobs.size() == 2U,
      "a generated chunk enters meshing and the second chunk remains pending");
  for (std::uint32_t tick = 0U; tick < 6U; ++tick) {
    context.expect(first.advance().error == WorldRuntimeError::none, "every cooperative world tick commits without a lifecycle error");
  }
  inspection = first.inspect();
  context.expect(inspection.pending_jobs.empty() && inspection.chunks.size() == 2U &&
      inspection.chunks[0].state == ChunkState::resident && inspection.chunks[1].state == ChunkState::resident,
      "both chunks reach resident after interleaved generation and mesh jobs");

  WorldRuntime replayed(config);
  context.expect(replayed.request(first_chunk) == WorldRuntimeError::none && replayed.request(second_chunk) == WorldRuntimeError::none,
      "a replay may submit the same chunks in another order");
  for (std::uint32_t tick = 0U; tick < 8U; ++tick) {
    context.expect(replayed.advance().error == WorldRuntimeError::none, "replayed cooperative tick succeeds");
  }
  context.expect(first.world_hash() == replayed.world_hash(),
      "submission order does not alter the committed world hash");

  context.expect(first.set_simulation_lod(first_chunk, SimulationLod::simplified) == WorldRuntimeError::none,
      "a resident chunk can select simplified simulation");
  context.expect(first.advance().simulation_updates.empty(), "simplified simulation waits for its logical cadence");
  const auto simplified = first.advance();
  context.expect(simplified.simulation_updates.size() == 1U && simplified.simulation_updates[0].elapsed_ticks == 2U,
      "simplified simulation receives exact elapsed logical time for catch-up");
  context.expect(first.set_simulation_lod(first_chunk, SimulationLod::active) == WorldRuntimeError::none,
      "simulation LOD can promote deterministically");
  const auto active = first.advance();
  context.expect(active.simulation_updates.size() == 1U && active.simulation_updates[0].elapsed_ticks == 1U,
      "active simulation updates every logical tick after promotion");
  context.expect(first.set_simulation_lod(first_chunk, SimulationLod::unloaded) == WorldRuntimeError::none,
      "simulation can become unloaded without removing chunk metadata");
  context.expect(first.advance().simulation_updates.empty(), "unloaded simulation does not consume catch-up work");
}

void check_reference_navigation(TestContext& context) {
  ReferenceNavigation navigation(5, 3, std::vector<bool>(15U, true));
  context.expect(navigation.add_region({1U, 0, 0, 4, 2, 1U}) == NavigationError::none,
      "a closed reference map declares a semantic navigation region");
  context.expect(navigation.add_profile({1U, 1U, 64U}) == NavigationError::none,
      "a declared agent profile owns layers and query budget");
  const NavigationPathQuery query{1U, 1U, {0, 1}, {4, 1}};
  const auto direct = navigation.find_path(query);
  context.expect(direct.error == NavigationError::none && direct.cells.size() == 5U && direct.region_ids == std::vector<std::uint32_t>{1U},
      "reference A* returns a quantized path and visited region IDs");

  context.expect(navigation.set_obstacle({1U, {2, 1}, 1U}) == NavigationError::none,
      "a dynamic obstacle is addressed by a stable semantic ID");
  const auto detour = navigation.find_path(query);
  context.expect(detour.error == NavigationError::none && detour.cells.size() == 7U &&
      std::none_of(detour.cells.begin(), detour.cells.end(), [](const auto cell) { return cell == NavigationCell{2, 1}; }),
      "an obstacle changes the path without mutating the navigation region");
  context.expect(navigation.set_obstacle({2U, {2, 0}, 1U}) == NavigationError::none &&
      navigation.set_obstacle({3U, {2, 2}, 1U}) == NavigationError::none,
      "a full wall can be authored as independent dynamic obstacles");
  context.expect(navigation.find_path(query).error == NavigationError::path_not_found,
      "a closed map reports a stable not-found result");
  context.expect(navigation.add_link({7U, {1, 1}, {3, 1}, 1U, 1U, true}) == NavigationError::none,
      "an off-mesh link is a declared navigation resource");
  const auto linked = navigation.find_path(query);
  context.expect(linked.error == NavigationError::none && linked.link_ids == std::vector<std::uint32_t>{7U},
      "the path reports the semantic link it traversed");

  context.expect(navigation.add_profile({2U, 1U, 1U}) == NavigationError::none,
      "a low-budget profile may be declared independently");
  context.expect(navigation.find_path({2U, 1U, {0, 1}, {4, 1}}).error == NavigationError::query_budget_exceeded,
      "query expansion budget rejects work before it can consume an unbounded tick");
  context.expect(navigation.find_path({99U, 1U, {0, 1}, {4, 1}}).error == NavigationError::profile_undeclared,
      "queries cannot use an undeclared agent profile");

  const std::vector<AvoidanceAgent> agents{{2U, 100, 0, 1000, 0, 200U, 1U}, {1U, 0, 0, 1000, 0, 200U, 1U}};
  const auto forward = navigation.avoid(agents);
  const auto reverse = navigation.avoid({agents[1], agents[0]});
  context.expect(forward == reverse && forward[0].agent_id == 1U && forward[1].agent_id == 2U &&
      (forward[0].velocity_z_milli != 0 || forward[1].velocity_z_milli != 0),
      "avoidance returns deterministic velocity intents rather than transforms");
}

void check_reference_motion(TestContext& context) {
  const SpatialGlobalPosition origin{7U, 0, 0, 0};
  const SpatialGlobalPosition east{7U, 4'000, 0, 0};
  ReferenceMotion motion;
  context.expect(motion.install({1U, 1U, MotionClock::logical, MotionKind::tween, origin, east, {0, 0, 0}, {0, 0, 0}, 10U, 4U}) == MotionError::none,
      "a logical tween declares entity, clock, endpoints and duration");
  context.expect(motion.advance_logical(9U).empty(), "motion stays scheduled before its declared logical time");
  const auto started = motion.advance_logical(10U);
  context.expect(started.size() == 1U && started[0].status == MotionStatus::running && started[0].position.x_milli == 0,
      "a logical tween starts at its declared fixed-point origin");
  const auto midpoint = motion.advance_logical(12U);
  context.expect(midpoint.size() == 1U && midpoint[0].position.x_milli == 2'000,
      "the midpoint uses declared integer interpolation");
  const auto completed = motion.advance_logical(14U);
  context.expect(completed.size() == 1U && completed[0].status == MotionStatus::completed && completed[0].position.x_milli == 4'000,
      "logical tween completion is exact and inspectable");

  RegionalWorld world(RegionalWorldConfig{7U, 2U});
  context.expect(world.put(1U, origin) == RegionalWorldError::none,
      "the consumer owns applying a motion position command");
  context.expect(world.put(completed[0].entity_id, completed[0].position) == RegionalWorldError::none,
      "motion output crosses the semantic regional-world boundary");
  SpatialEntityLocation location{};
  context.expect(world.locate(1U, location) == RegionalWorldError::none && location.position.x_milli == 4'000,
      "motion does not write world state except through the consumer command");

  const auto logical_hash = motion.logical_hash();
  context.expect(motion.install({2U, 2U, MotionClock::presentation, MotionKind::tween, origin, east, {0, 0, 0}, {0, 0, 0}, 0U, 500U}) == MotionError::none,
      "presentation motion is declared separately from logical motion");
  const auto visual = motion.advance_presentation(250U);
  context.expect(visual.size() == 1U && visual[0].position.x_milli == 2'000,
      "presentation motion is sampled in its own time unit");
  context.expect(motion.logical_hash() == logical_hash,
      "presentation motion never changes the logical motion hash");

  context.expect(motion.install({3U, 3U, MotionClock::logical, MotionKind::ballistic, origin, origin, {500, 0, 0}, {100, 0, 0}, 0U, 5U}) == MotionError::none,
      "ballistic motion declares integer velocity and acceleration");
  const auto ballistic = motion.advance_logical(2U);
  context.expect(ballistic.size() == 1U && ballistic[0].position.x_milli == 1'200,
      "ballistic motion uses a deterministic integer trajectory");
  context.expect(motion.cancel(3U, MotionCancelCause::none) == MotionError::cancel_cause_required,
      "motion cancellation cannot discard a cause");
  context.expect(motion.cancel(3U, MotionCancelCause::explicit_request) == MotionError::none,
      "motion cancellation records an explicit cause");
  const auto inspected = motion.inspect();
  context.expect(inspected[2].status == MotionStatus::cancelled && inspected[2].cancel_cause == MotionCancelCause::explicit_request,
      "inspection retains the terminal cancellation cause");
}

void check_reference_physics(TestContext& context) {
  const SpatialGlobalPosition origin{7U, 0, 0, 0};
  ReferencePhysics physics;
  context.expect(physics.add_body({1U, PhysicsAuthority::gameplay, PhysicsBodyKind::static_body, 1U, 1U, origin, {0, 0, 0}, {500, 500, 500}}) == PhysicsError::none,
      "a gameplay static box declares authority, layers and quantized collider");
  context.expect(physics.add_body({2U, PhysicsAuthority::gameplay, PhysicsBodyKind::dynamic, 1U, 1U, {7U, -1'000, 0, 0}, {600, 0, 0}, {500, 500, 500}}) == PhysicsError::none,
      "a gameplay dynamic box declares quantized velocity");
  const auto first = physics.step();
  context.expect(first.error == PhysicsError::none && first.contacts.size() == 1U && first.committed_bodies.size() == 2U,
      "physics commits ordered gameplay bodies and contacts");
  context.expect(first.committed_bodies[1].id == 2U && first.committed_bodies[1].position.x_milli == -1'000 &&
      first.committed_bodies[1].velocity.x_milli == 0,
      "dynamic resolution quantizes position and removes normal velocity at commit");
  context.expect(physics.gameplay_hash() == 0xebd1bf8d86436310ULL,
      "quantized bodies and contact match the reference physics golden vector");
  context.expect(physics.add_body({3U, PhysicsAuthority::presentation, PhysicsBodyKind::dynamic, 2U, 2U, {7U, 10'000, 0, 0}, {50, 0, 0}, {250, 250, 250}}) == PhysicsError::none,
      "presentation physics remains isolated on its declared layer");
  context.expect(physics.step().error == PhysicsError::none,
      "a separately layered presentation body can advance alongside gameplay physics");

  ReferencePhysics isolated;
  context.expect(isolated.add_body({1U, PhysicsAuthority::gameplay, PhysicsBodyKind::static_body, 1U, 1U, origin, {0, 0, 0}, {100, 100, 100}}) == PhysicsError::none,
      "an isolated gameplay body establishes a commit hash baseline");
  static_cast<void>(isolated.step());
  const auto hash = isolated.gameplay_hash();
  context.expect(isolated.add_body({2U, PhysicsAuthority::presentation, PhysicsBodyKind::dynamic, 2U, 2U, {7U, 10'000, 0, 0}, {50, 0, 0}, {100, 100, 100}}) == PhysicsError::none &&
      isolated.step().error == PhysicsError::none && isolated.gameplay_hash() == hash,
      "presentation-body integration never changes the gameplay commit hash");

  ReferencePhysics triggered;
  context.expect(triggered.add_body({1U, PhysicsAuthority::gameplay, PhysicsBodyKind::dynamic, 1U, 1U, origin, {0, 0, 0}, {500, 500, 500}}) == PhysicsError::none &&
      triggered.add_body({2U, PhysicsAuthority::gameplay, PhysicsBodyKind::trigger, 1U, 1U, origin, {0, 0, 0}, {500, 500, 500}}) == PhysicsError::none,
      "trigger bodies use the same semantic collider declaration");
  const auto trigger_step = triggered.step();
  context.expect(trigger_step.contacts.size() == 1U && trigger_step.contacts[0].trigger &&
      trigger_step.committed_bodies[0].position.x_milli == 0,
      "triggers record contacts without resolving a gameplay transform");

  ReferencePhysics mixed;
  context.expect(mixed.add_body({1U, PhysicsAuthority::gameplay, PhysicsBodyKind::dynamic, 1U, 1U, origin, {0, 0, 0}, {100, 100, 100}}) == PhysicsError::none &&
      mixed.add_body({2U, PhysicsAuthority::presentation, PhysicsBodyKind::dynamic, 1U, 1U, origin, {0, 0, 0}, {100, 100, 100}}) == PhysicsError::none,
      "mixed authority setup is representable for boundary validation");
  context.expect(mixed.step().error == PhysicsError::authority_mismatch,
      "cross-authority layers are rejected before a presentation body can affect gameplay");
  context.expect(physics.add_body({4U, PhysicsAuthority::gameplay, PhysicsBodyKind::dynamic, 1U, 1U, origin, {0, 0, 0}, {0, 100, 100}}) == PhysicsError::collider_invalid,
      "invalid colliders are observable instead of approximated");
}

void check_reference_mass(TestContext& context) {
  ReferenceMass mass({1U, 1U, 1U, 1'000, 2U});
  context.expect(mass.add({2U, MassLevel::simplified_agent, 500, 0, 10, 0, 8}) == MassError::none &&
      mass.add({1U, MassLevel::full_entity, 0, 0, 100, 0, 10}) == MassError::none &&
      mass.add({3U, MassLevel::visual_instance, 0, 0, 100, 0, 1}) == MassError::none,
      "Mass stores independently allocated agents in canonical SoA id order");
  const auto inspection = mass.inspect();
  context.expect(inspection.agents[0].id == 1U && inspection.agents[1].id == 2U && inspection.visual_instances == 1U,
      "inspection exposes deterministic level counts without object-owned iteration");
  context.expect(mass.add({4U, MassLevel::full_entity, 0, 0, 0, 0, 1}) == MassError::budget_exceeded,
      "authoritative level budgets reject uncontrolled population growth");
  const auto hash_before_visual = mass.authoritative_hash();
  context.expect(mass.advance() == MassError::none, "authoritative Mass levels advance in batch");
  const auto advanced = mass.inspect();
  context.expect(advanced.agents[0].x_milli == 100 && advanced.agents[1].x_milli == 510 && advanced.agents[2].x_milli == 0,
      "visual-only instances do not simulate or mutate authoritative agent arrays");
  std::vector<std::uint32_t> nearby;
  context.expect(mass.query_disc(0, 0, 1'000, 2U, nearby) == MassError::none && nearby == std::vector<std::uint32_t>{1U, 2U},
      "bounded spatial queries return authoritative agents in canonical order");
  context.expect(mass.query_disc(0, 0, 1'000, 1U, nearby) == MassError::query_too_broad,
      "a query exceeding its declared result budget is not silently truncated");
  context.expect(mass.damage_disc(0, 0, 1'000, 1, 2U) == MassError::none && mass.inspect().agents[0].health == 9,
      "area damage applies in deterministic batch order");
  context.expect(mass.set_level(1U, MassLevel::aggregate_group) == MassError::none &&
      mass.set_level(3U, MassLevel::full_entity) == MassError::none,
      "promotion and demotion honor the declared budgets");
  context.expect(hash_before_visual != mass.authoritative_hash(),
      "only authoritative agents and their declared levels contribute to the Mass hash");
}

void check_generation(TestContext& context) {
  const auto origin = chunk_at(0, 0);
  context.expect(
      verify_generator_determinism(42U, origin) == GeneratorCheck::none,
      "generating the same identity twice produces the same chunk");

  // Generation is a pure function of identity, so load order cannot matter.
  const auto east = chunk_at(1, 0);
  const auto forward_origin = generate_chunk(42U, origin);
  const auto forward_east = generate_chunk(42U, east);
  const auto reverse_east = generate_chunk(42U, east);
  const auto reverse_origin = generate_chunk(42U, origin);
  context.expect(
      chunk_content_hash(forward_origin) == chunk_content_hash(reverse_origin) &&
          chunk_content_hash(forward_east) == chunk_content_hash(reverse_east),
      "generating neighbours in either order gives the same chunks");

  // The shared edge must agree, which is why terrain samples global coordinates
  // instead of a per-chunk stream.
  context.expect(verify_chunk_seam(forward_origin, forward_east) == GeneratorCheck::none, "east seam matches");
  const auto south = generate_chunk(42U, chunk_at(0, 1));
  context.expect(verify_chunk_seam(forward_origin, south) == GeneratorCheck::none, "south seam matches");
  context.expect(
      verify_chunk_seam(forward_origin, generate_chunk(42U, chunk_at(5, 5))) == GeneratorCheck::seam_detected,
      "chunks that do not touch are not a seam");

  // A different world is a different chunk: seed, coordinate and generator version.
  context.expect(
      chunk_content_hash(generate_chunk(43U, origin)) != chunk_content_hash(forward_origin),
      "another root seed produces another world");
  ChunkIdentity newer = origin;
  newer.generator_version = 2U;
  context.expect(
      chunk_content_hash(generate_chunk(42U, newer)) != chunk_content_hash(forward_origin),
      "a new generator version produces another world");
  context.expect(
      chunk_content_hash(forward_east) != chunk_content_hash(forward_origin),
      "neighbouring chunks are not copies of each other");

  // The field is terrain, not noise: neighbouring samples stay close together.
  std::int64_t largest_step = 0;
  for (std::int32_t index = 1; index < chunk_sample_edge; ++index) {
    const auto previous = forward_origin.height[static_cast<std::size_t>(index) - 1];
    const auto current = forward_origin.height[static_cast<std::size_t>(index)];
    const auto step = previous > current ? previous - current : current - previous;
    if (step > largest_step) largest_step = step;
  }
  context.expect(largest_step > 0, "the height field is not flat");
  context.expect(largest_step < 4'000, "adjacent samples are continuous, not white noise");
}

/// Applies a plan the way a world tick would: request, commit generated identity, mesh, evict.
///
/// Generation quality and seams are covered by check_generation. Streaming only
/// owns residency and lifecycle, so constructing a full heightfield here would
/// couple two tests and multiply their cost by every step of the long walk.
void advance_streaming(ChunkRegistry& registry, const WorldPosition viewer, const StreamingWindow& window) {
  const auto plan = plan_streaming(registry, viewer, window);
  for (const auto& identity : plan.to_request) {
    static_cast<void>(registry.request(identity));
    static_cast<void>(registry.transition(identity, ChunkState::generating));
    static_cast<void>(registry.set_content_hash(identity, chunk_seed(42U, identity)));
    static_cast<void>(registry.transition(identity, ChunkState::ready_for_mesh));
    static_cast<void>(registry.transition(identity, ChunkState::meshing));
    static_cast<void>(registry.transition(identity, ChunkState::resident));
  }
  for (const auto& identity : plan.to_evict) {
    static_cast<void>(registry.transition(identity, ChunkState::evictable));
    static_cast<void>(registry.set_resident_resources(identity, 0U));
    static_cast<void>(registry.discard(identity));
  }
}

void check_streaming(TestContext& context) {
  const StreamingWindow window{2, 1U, 1U};
  const std::int32_t expected_resident = (2 * window.radius + 1) * (2 * window.radius + 1);

  ChunkRegistry registry;
  WorldPosition viewer{0U, 0, 0, 0, 0, 0, 0};
  advance_streaming(registry, viewer, window);
  context.expect(
      static_cast<std::int32_t>(registry.snapshot().size()) == expected_resident,
      "the first plan fills the window");

  // A long walk: residency must stabilise instead of growing with distance.
  for (std::int32_t step = 0; step < 200; ++step) {
    const auto moved = translate(viewer, WorldOffset{chunk_extent_scaled, 0, 0});
    context.expect(moved.error == WorldPositionError::none, "the viewer keeps moving east");
    viewer = moved.value;
    advance_streaming(registry, viewer, window);
    if (static_cast<std::int32_t>(registry.snapshot().size()) != expected_resident) {
      context.expect(false, "residency stays bounded during a long trip");
      break;
    }
  }
  context.expect(registry.snapshot().front().identity.x >= 198, "the window followed the viewer");

  // Standing still asks for nothing and releases nothing.
  const auto idle = plan_streaming(registry, viewer, window);
  context.expect(idle.to_request.empty() && idle.to_evict.empty(), "a still viewer plans no work");

  // The same walk from a fresh registry reaches the same world, chunk for chunk.
  ChunkRegistry replayed;
  WorldPosition replay_viewer{0U, 0, 0, 0, 0, 0, 0};
  advance_streaming(replayed, replay_viewer, window);
  for (std::int32_t step = 0; step < 200; ++step) {
    replay_viewer = translate(replay_viewer, WorldOffset{chunk_extent_scaled, 0, 0}).value;
    advance_streaming(replayed, replay_viewer, window);
  }
  context.expect(replayed.world_hash() == registry.world_hash(), "the same walk reproduces the same world");

  // Returning to a chunk that was evicted regenerates it identically.
  ChunkRegistry revisited;
  advance_streaming(revisited, WorldPosition{0U, 0, 0, 0, 0, 0, 0}, window);
  const auto before = revisited.world_hash();
  advance_streaming(revisited, WorldPosition{0U, 50, 0, 0, 0, 0, 0}, window);
  advance_streaming(revisited, WorldPosition{0U, 0, 0, 0, 0, 0, 0}, window);
  context.expect(revisited.world_hash() == before, "coming back regenerates the same chunks");
}

void check_statechart_runtime(TestContext& context) {
  StatechartRuntime chart;
  context.expect(chart.install({{1U, std::nullopt, false, {}, {}}, {2U, 1U, true, {}, {}}, {3U, 2U, false, {}, {}}}, {
      {10U, 3U, 7U, std::nullopt, 1U, 0U, StatechartTransitionKind::external, std::nullopt, {}},
      {11U, 2U, 7U, std::nullopt, 3U, 1U, StatechartTransitionKind::external, std::nullopt, {}}}, 3U) == StatechartError::none,
      "statechart installs with explicit precedence");
  const auto transition = chart.dispatch(7U);
  context.expect(transition.error == StatechartError::none && transition.chosen->id == 10U,
      "the active leaf transition wins before an ancestor");
  context.expect(chart.active() == 1U, "external transition commits the target");
  context.expect(chart.dispatch(99U).error == StatechartError::event_unhandled, "unhandled events stay explicit");

  StatechartRuntime restored;
  context.expect(restored.install({{1U, std::nullopt, false, {}, {}}, {2U, 1U, true, {}, {}}, {3U, 2U, false, {}, {}}}, {}, 1U) == StatechartError::none,
      "the restore chart installs");
  context.expect(restored.restore(chart.snapshot()) == StatechartError::none && restored.active() == 1U,
      "snapshot restores active state and shallow history");
  StatechartRuntime ambiguous;
  context.expect(ambiguous.install({{1U, std::nullopt, false, {}, {}}}, {
      {1U, 1U, 1U, std::nullopt, 1U, 0U, StatechartTransitionKind::external, std::nullopt, {}},
      {2U, 1U, 1U, std::nullopt, 1U, 0U, StatechartTransitionKind::external, std::nullopt, {}}}, 1U) == StatechartError::transition_ambiguous,
      "equal precedence is rejected at installation");

  StatechartRuntime guarded;
  context.expect(guarded.install({{1U, std::nullopt, false, {}, {}}, {2U, std::nullopt, false, {}, {}}, {3U, std::nullopt, false, {}, {}}}, {
      {10U, 1U, 4U, std::nullopt, 2U, 0U, StatechartTransitionKind::external, 1U, {}},
      {11U, 1U, 4U, std::nullopt, 3U, 1U, StatechartTransitionKind::external, std::nullopt, {}}}, 1U) == StatechartError::none,
      "guarded precedence chart installs");
  const auto guarded_result = guarded.dispatch(4U, [](const std::uint32_t id, const StatechartTransition&) {
    return std::optional<bool>{id != 1U};
  });
  context.expect(guarded_result.chosen.has_value() && guarded_result.chosen->id == 11U && guarded_result.guards.size() == 1U && !guarded_result.guards[0].passed,
      "guards evaluate in priority order and fall through deterministically");
}

}  // namespace

int main() {
  TestContext context;
  check_fixed_point(context);
  check_random_streams(context);
  check_world_position(context);
  check_chunk_lifecycle(context);
  check_chunk_seed(context);
  check_job_commit_order(context);
  check_cooperative_world_runtime(context);
  check_reference_navigation(context);
  check_reference_motion(context);
  check_reference_physics(context);
  check_reference_mass(context);
  check_generation(context);
  check_streaming(context);
  check_statechart_runtime(context);
  if (context.failures > 0) {
    std::fprintf(stderr, "%d kernel determinism checks failed\n", context.failures);
    return 1;
  }
  std::printf("kernel determinism checks passed\n");
  return 0;
}
