#include "ludivra/runtime.h"
#include "ludivra/network.h"
#include "ludivra/region_storage.h"
#include "ludivra/spatial.h"

#include "lua_sandbox.hpp"

#include <cinttypes>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr uint64_t expected_state_hash = 0x81478b41055d6de6ULL;

struct TestContext final {
  void expect(const bool condition, const char* message) {
    if (!condition) {
      std::fprintf(stderr, "FAIL: %s\n", message);
      ++failures;
    }
  }

  int failures{0};
};

ludivra_runtime* create_runtime(TestContext& context, const uint32_t max_pending_inputs = 4096U) {
  const ludivra_runtime_config config{
      sizeof(ludivra_runtime_config), 60U, max_pending_inputs, 42U};
  ludivra_runtime* runtime = nullptr;
  context.expect(ludivra_runtime_create(&config, &runtime) == LUDIVRA_OK, "runtime creation succeeds");
  return runtime;
}

void submit(
    TestContext& context,
    ludivra_runtime* runtime,
    const uint32_t action,
    const int32_t value,
    const uint64_t sequence) {
  const ludivra_logical_input input{sizeof(ludivra_logical_input), action, value, sequence};
  context.expect(
      ludivra_runtime_submit_input(runtime, &input) == LUDIVRA_OK,
      "input submission succeeds");
}

uint64_t state_hash(TestContext& context, ludivra_runtime* runtime) {
  uint64_t value = 0;
  context.expect(
      ludivra_runtime_state_hash(runtime, &value) == LUDIVRA_OK,
      "state hash inspection succeeds");
  return value;
}

int64_t integer_state(TestContext& context, ludivra_runtime* runtime, const uint32_t key) {
  int64_t value = 0;
  context.expect(
      ludivra_runtime_integer_state(runtime, key, &value) == LUDIVRA_OK,
      "integer state inspection succeeds");
  return value;
}

std::string fixture(const char* name) {
  std::ifstream input(std::string(LUDIVRA_TEST_FIXTURE_DIR) + "/" + name);
  std::ostringstream content;
  content << input.rdbuf();
  return content.str();
}

std::string counter_gameplay() {
  return fixture("counter.lua");
}

std::string determinism_gameplay() {
  return fixture("determinism.lua");
}

std::string symbol_gameplay() {
  return fixture("symbols.lua");
}

std::string unknown_symbol_gameplay() {
  return fixture("unknown-symbol.lua");
}

std::string timer_gameplay() {
  return fixture("timers.lua");
}

std::string content_gameplay() {
  return fixture("content.lua");
}

std::string time_gameplay() {
  return fixture("time.lua");
}

std::string statechart_gameplay() {
  return fixture("statechart.lua");
}

std::string region_storage_gameplay() {
  return fixture("region-storage.lua");
}

std::vector<uint8_t> save_archive(TestContext& context, ludivra_runtime* runtime) {
  uint32_t size = 0;
  context.expect(ludivra_runtime_save_size(runtime, &size) == LUDIVRA_OK, "save size is available");
  std::vector<uint8_t> archive(size);
  context.expect(
      ludivra_runtime_save_write(runtime, archive.data(), size) == LUDIVRA_OK,
      "save archive is written");
  return archive;
}

std::vector<uint8_t> replay_archive(TestContext& context, ludivra_runtime* runtime) {
  uint32_t size = 0;
  context.expect(
      ludivra_runtime_replay_size(runtime, &size) == LUDIVRA_OK,
      "replay size is available");
  std::vector<uint8_t> archive(size);
  context.expect(
      ludivra_runtime_replay_write(runtime, archive.data(), size) == LUDIVRA_OK,
      "replay archive is written");
  return archive;
}

void check_regional_world(TestContext& context) {
  context.expect(ludivra_spatial_abi_version() == 1U, "spatial ABI version is stable");
  ludivra_spatial_world* invalid = nullptr;
  const ludivra_spatial_world_config invalid_config{sizeof(ludivra_spatial_world_config), 7U, 0U, 0U};
  context.expect(
      ludivra_spatial_world_create(&invalid_config, &invalid) == LUDIVRA_SPATIAL_ERROR_CONFIGURATION_INVALID && invalid == nullptr,
      "a spatial world rejects a zero region extent");

  const ludivra_spatial_world_config config{sizeof(ludivra_spatial_world_config), 7U, 0U, 2U};
  ludivra_spatial_world* world = nullptr;
  context.expect(ludivra_spatial_world_create(&config, &world) == LUDIVRA_SPATIAL_OK && world != nullptr,
      "a consumer creates a semantic regional world");
  const ludivra_spatial_global_position first{sizeof(ludivra_spatial_global_position), 7U, 0U, 63'500, 0, 0};
  context.expect(ludivra_spatial_world_put(world, 1U, &first) == LUDIVRA_SPATIAL_OK,
      "a semantic global position enters the internal partition");
  const ludivra_spatial_offset east{sizeof(ludivra_spatial_offset), 0U, 1'000, 0, 0};
  context.expect(ludivra_spatial_world_translate(world, 1U, &east) == LUDIVRA_SPATIAL_OK,
      "translation crosses an internal chunk without exposing it");

  ludivra_spatial_location location{sizeof(ludivra_spatial_location), 0U, 0U, 0U, 0, 0, 0, 0, 0, 0};
  context.expect(ludivra_spatial_world_locate(world, 1U, &location) == LUDIVRA_SPATIAL_OK,
      "consumer inspection returns a semantic position");
  context.expect(location.entity_id == 1U && location.dimension == 7U && location.x_milli == 64'500 && location.region_x == 1,
      "region assignment follows a deterministic internal partition");

  const ludivra_spatial_global_position second{sizeof(ludivra_spatial_global_position), 7U, 0U, 65'000, 0, 0};
  context.expect(ludivra_spatial_world_put(world, 2U, &second) == LUDIVRA_SPATIAL_OK,
      "a second consumer entity enters the same region");
  const ludivra_spatial_region region{7U, 0U, 1, 0, 0};
  uint32_t count = 0U;
  context.expect(ludivra_spatial_world_entities_in_count(world, &region, &count) == LUDIVRA_SPATIAL_OK && count == 2U,
      "region query reports deterministic membership");
  uint32_t one_entity = 0U;
  context.expect(
      ludivra_spatial_world_entities_in_write(world, &region, &one_entity, 1U, &count) == LUDIVRA_SPATIAL_ERROR_BUFFER_TOO_SMALL && count == 2U,
      "partition inspection rejects a short output buffer");
  uint32_t entities[2]{};
  context.expect(
      ludivra_spatial_world_entities_in_write(world, &region, entities, 2U, &count) == LUDIVRA_SPATIAL_OK &&
          entities[0] == 1U && entities[1] == 2U,
      "region membership is sorted by semantic entity id");
  const ludivra_spatial_global_position wrong_dimension{sizeof(ludivra_spatial_global_position), 8U, 0U, 0, 0, 0};
  context.expect(ludivra_spatial_world_put(world, 3U, &wrong_dimension) == LUDIVRA_SPATIAL_ERROR_DIMENSION_MISMATCH,
      "a consumer cannot mix dimensions in one world");
  const ludivra_spatial_offset no_op{sizeof(ludivra_spatial_offset), 0U, 0, 0, 0};
  context.expect(ludivra_spatial_world_translate(world, 99U, &no_op) == LUDIVRA_SPATIAL_ERROR_ENTITY_UNKNOWN,
      "unknown spatial entities are observable errors");
  ludivra_spatial_world_destroy(world);
}

void check_region_storage_c_api(TestContext& context) {
  const std::filesystem::path root = std::filesystem::temp_directory_path() / "ludivra-region-storage-c-api-test";
  std::error_code filesystem_error;
  std::filesystem::remove_all(root, filesystem_error);
  const std::string root_text = root.string();
  const ludivra_region_storage_config config{sizeof(ludivra_region_storage_config), root_text.data(),
      static_cast<uint32_t>(root_text.size()), 0U, 1U * 1024U * 1024U};
  ludivra_region_storage* storage = nullptr;
  context.expect(ludivra_region_storage_abi_version() == 1U &&
      ludivra_region_storage_create(&config, &storage) == LUDIVRA_REGION_STORAGE_OK && storage != nullptr,
      "the native region-storage C boundary creates an opaque store");
  const uint8_t delta_bytes[]{0x01U, 0x02U};
  const uint8_t entities[]{0x10U};
  const ludivra_region_storage_delta delta{0, 0, 0, {delta_bytes, 2U}};
  const char generator[] = "ember-vault";
  const ludivra_region_storage_record record{sizeof(ludivra_region_storage_record), {7U, 0U, 0, 0, 0}, generator, 11U,
      3U, 41U, &delta, 1U, {entities, 1U}, {nullptr, 0U}, {nullptr, 0U}};
  context.expect(ludivra_region_storage_write(storage, &record) == LUDIVRA_REGION_STORAGE_OK,
      "the C boundary writes a typed regional delta without exposing generated base chunks");
  uint32_t count = 0U;
  context.expect(ludivra_region_storage_inspect_count(storage, &count) == LUDIVRA_REGION_STORAGE_OK && count == 1U,
      "C inspection reports deterministic region count");
  ludivra_region_storage_key short_buffer{};
  context.expect(ludivra_region_storage_inspect_write(storage, &short_buffer, 0U, &count) == LUDIVRA_REGION_STORAGE_ERROR_BUFFER_TOO_SMALL &&
      count == 1U,
      "C inspection retains required count when the region-key output buffer is too short");
  ludivra_region_storage_key key{};
  context.expect(ludivra_region_storage_inspect_write(storage, &key, 1U, &count) == LUDIVRA_REGION_STORAGE_OK &&
      key.dimension == 7U && key.x == 0,
      "C inspection writes canonical regional keys");
  uint32_t migrated = 1U;
  context.expect(ludivra_region_storage_compact(storage, &key) == LUDIVRA_REGION_STORAGE_OK &&
      ludivra_region_storage_migrate(storage, &key, &migrated) == LUDIVRA_REGION_STORAGE_OK && migrated == 0U,
      "C compact and migrate execute the real native storage operations");
  ludivra_region_storage_recovery recovery{sizeof(ludivra_region_storage_recovery), 0U, 0U};
  context.expect(ludivra_region_storage_recover(storage, &recovery) == LUDIVRA_REGION_STORAGE_OK && recovery.replayed_regions == 0U,
      "C recovery reports its journal result without silently changing a clean store");
  ludivra_region_storage_destroy(storage);
  std::filesystem::remove_all(root, filesystem_error);
  context.expect(!filesystem_error, "region-storage C API fixture leaves no filesystem artifacts");
}

void check_runtime_region_storage(TestContext& context) {
  const std::filesystem::path root = std::filesystem::temp_directory_path() / "ludivra-runtime-region-storage-test";
  std::error_code filesystem_error;
  std::filesystem::remove_all(root, filesystem_error);
  const std::string root_text = root.string();
  const char generator[] = "ember-vault";
  const ludivra_runtime_region_storage_config config{sizeof(ludivra_runtime_region_storage_config), root_text.data(),
      static_cast<uint32_t>(root_text.size()), 0U, 1U * 1024U * 1024U, generator, 11U, 3U};
  auto* persisted = create_runtime(context);
  context.expect(ludivra_runtime_configure_region_storage(persisted, &config) == LUDIVRA_OK,
      "runtime recovers and owns a configured region store");
  const auto source = region_storage_gameplay();
  context.expect(ludivra_runtime_load_gameplay(persisted, source.data(), static_cast<uint32_t>(source.size())) == LUDIVRA_OK,
      "Lua gameplay exposing a regional delta command loads");
  submit(context, persisted, 91U, 0, 1U);
  context.expect(ludivra_runtime_step(persisted, 1U) == LUDIVRA_OK,
      "Lua region delta is committed through the runtime boundary");
  const auto saved = save_archive(context, persisted);
  context.expect(saved.size() > 8U && saved[4] == 6U,
      "logical save version 6 references external regional data without embedding generated base chunks");
  const auto replay = replay_archive(context, persisted);

  ludivra_region_storage* storage = nullptr;
  const ludivra_region_storage_config storage_config{sizeof(ludivra_region_storage_config), root_text.data(),
      static_cast<uint32_t>(root_text.size()), 0U, 1U * 1024U * 1024U};
  uint32_t region_count = 0U;
  context.expect(ludivra_region_storage_create(&storage_config, &storage) == LUDIVRA_REGION_STORAGE_OK &&
      ludivra_region_storage_inspect_count(storage, &region_count) == LUDIVRA_REGION_STORAGE_OK && region_count == 1U,
      "the runtime stores one regional delta in LDWR rather than the logical archive");
  ludivra_region_storage_destroy(storage);

  auto* restored = create_runtime(context);
  context.expect(ludivra_runtime_configure_region_storage(restored, &config) == LUDIVRA_OK &&
      ludivra_runtime_load_gameplay(restored, source.data(), static_cast<uint32_t>(source.size())) == LUDIVRA_OK &&
      ludivra_runtime_load_save(restored, saved.data(), static_cast<uint32_t>(saved.size())) == LUDIVRA_OK &&
      state_hash(context, restored) == state_hash(context, persisted),
      "save restore verifies the region fingerprint and keeps the runtime hash");
  context.expect(ludivra_runtime_verify_replay(persisted, replay.data(), static_cast<uint32_t>(replay.size())) == LUDIVRA_OK,
      "replay re-executes regional Lua commands without rewriting the region store");

  const char wrong_generator[] = "wrong-world";
  const ludivra_runtime_region_storage_config wrong_config{sizeof(ludivra_runtime_region_storage_config), root_text.data(),
      static_cast<uint32_t>(root_text.size()), 0U, 1U * 1024U * 1024U, wrong_generator, 11U, 3U};
  auto* incompatible = create_runtime(context);
  context.expect(ludivra_runtime_configure_region_storage(incompatible, &wrong_config) == LUDIVRA_OK &&
      ludivra_runtime_load_save(incompatible, saved.data(), static_cast<uint32_t>(saved.size())) == LUDIVRA_ERROR_REGION_IDENTITY_MISMATCH,
      "restore rejects a region from another declared generator identity");
  ludivra_runtime_destroy(incompatible);
  ludivra_runtime_destroy(restored);
  ludivra_runtime_destroy(persisted);
  std::filesystem::remove_all(root, filesystem_error);
  context.expect(!filesystem_error, "runtime region-storage fixture leaves no filesystem artifacts");
}

void check_network_c_api(TestContext& context) {
  auto* host = create_runtime(context);
  const char generator[] = "ember-vault";
  const ludivra_network_room_config config{sizeof(ludivra_network_room_config), 60U, 4096U, 42U,
      2U, 2U, 4U, generator, 11U, 3U, 0x44aabbccU};
  ludivra_network_room* room = nullptr;
  context.expect(ludivra_network_abi_version() == 1U &&
      ludivra_network_room_create(host, &config, &room) == LUDIVRA_NETWORK_OK && room != nullptr,
      "network C boundary binds a room to the supplied authoritative runtime");
  const ludivra_network_peer_hello hello{sizeof(ludivra_network_peer_hello), 2U, generator, 11U, 3U, 0U, 42U, 0x44aabbccU};
  uint32_t client = 0U;
  context.expect(ludivra_network_room_connect(room, &hello, &client) == LUDIVRA_NETWORK_OK && client == 1U,
      "network C boundary completes the logical peer handshake");
  const ludivra_network_input input{sizeof(ludivra_network_input), 9U, 1000, 0U, 1U};
  context.expect(ludivra_network_room_submit_input(room, client, &input) == LUDIVRA_NETWORK_OK &&
      ludivra_network_room_reject_client_state(room, client) == LUDIVRA_NETWORK_ERROR_CLIENT_SENT_STATE &&
      ludivra_network_room_advance(room) == LUDIVRA_NETWORK_OK,
      "network C boundary accepts input but rejects any client-owned authoritative state");
  uint32_t snapshot_size = 0U;
  context.expect(ludivra_network_room_snapshot_size(room, &snapshot_size) == LUDIVRA_NETWORK_OK && snapshot_size > 8U,
      "network C boundary reports the checksummed host snapshot size");
  std::vector<uint8_t> snapshot(snapshot_size);
  uint64_t tick = 0U;
  uint64_t hash = 0U;
  context.expect(ludivra_network_room_snapshot_write(room, snapshot.data(), snapshot_size, &tick, &hash) == LUDIVRA_NETWORK_OK &&
      tick == 1U && hash == state_hash(context, host),
      "network C boundary writes the current host archive with matching tick and hash");
  ludivra_network_room_destroy(room);
  ludivra_runtime_destroy(host);
}

}  // namespace

int main() {
  TestContext context;
  context.expect(
      ludivra::kernel::LuaSandbox::sdk_contract_boundary_valid(),
      "the reachable Lua SDK surface matches its versioned contract");
  context.expect(ludivra_runtime_abi_version() == 6U, "ABI version is stable");
  check_regional_world(context);
  check_region_storage_c_api(context);
  check_runtime_region_storage(context);
  check_network_c_api(context);
  context.expect(
      ludivra_runtime_create(nullptr, nullptr) == LUDIVRA_ERROR_INVALID_ARGUMENT,
      "invalid creation arguments are rejected");
  const ludivra_runtime_config invalid_config{sizeof(ludivra_runtime_config), 60U, 0U, 42U};
  ludivra_runtime* invalid_runtime = nullptr;
  context.expect(
      ludivra_runtime_create(&invalid_config, &invalid_runtime) == LUDIVRA_ERROR_INVALID_ARGUMENT,
      "zero input limit is rejected");
  context.expect(invalid_runtime == nullptr, "failed creation clears the output handle");

  auto* first = create_runtime(context);
  auto* second = create_runtime(context);
  submit(context, first, 2U, -500, 20U);
  submit(context, first, 1U, 1000, 10U);
  submit(context, second, 1U, 1000, 10U);
  submit(context, second, 2U, -500, 20U);

  context.expect(ludivra_runtime_step(first, 2U) == LUDIVRA_OK, "first runtime advances");
  context.expect(ludivra_runtime_step(second, 2U) == LUDIVRA_OK, "second runtime advances");

  uint64_t tick = 0;
  context.expect(ludivra_runtime_tick(first, &tick) == LUDIVRA_OK, "tick inspection succeeds");
  context.expect(tick == 2U, "tick count is exact");
  context.expect(
      state_hash(context, first) == state_hash(context, second),
      "input arrival order does not change state hash");
  context.expect(
      state_hash(context, first) == expected_state_hash,
      "state hash matches the golden vector");

  {
    auto* charted = create_runtime(context);
    const ludivra_statechart_state states[] = {{1U, 0U, 0U, 0U}, {2U, 1U, 1U, 1U}};
    const ludivra_statechart_transition transitions[] = {{9U, 1U, 7U, 2U, 0U, 0U, 0U, 0U}};
    context.expect(ludivra_runtime_install_statechart(charted, states, 2U, transitions, 1U, nullptr, 0U, 1U) == LUDIVRA_OK,
        "statechart installs through the public runtime API");
    submit(context, charted, 7U, 0, 1U);
    context.expect(ludivra_runtime_step(charted, 1U) == LUDIVRA_OK, "statechart event commits with its logical input");
    uint32_t active_state = 0;
    context.expect(ludivra_runtime_statechart_active(charted, &active_state) == LUDIVRA_OK && active_state == 2U,
        "statechart exposes the committed active state");
    const auto saved_chart = save_archive(context, charted);
    auto* restored_chart = create_runtime(context);
    context.expect(ludivra_runtime_install_statechart(restored_chart, states, 2U, transitions, 1U, nullptr, 0U, 1U) == LUDIVRA_OK,
        "restored runtime installs the same statechart definition");
    context.expect(ludivra_runtime_load_save(restored_chart, saved_chart.data(), static_cast<uint32_t>(saved_chart.size())) == LUDIVRA_OK,
        "save restores the statechart snapshot");
    context.expect(ludivra_runtime_statechart_active(restored_chart, &active_state) == LUDIVRA_OK && active_state == 2U,
        "restored statechart keeps its active state");
    const auto replay = replay_archive(context, charted);
    context.expect(ludivra_runtime_verify_replay(charted, replay.data(), static_cast<uint32_t>(replay.size())) == LUDIVRA_OK,
        "replay re-executes statechart transitions deterministically");
    ludivra_runtime_destroy(restored_chart);
    ludivra_runtime_destroy(charted);
  }

  {
    // Guards are read-only Lua queries and lifecycle actions use the ordinary
    // command buffer in deterministic transition, entry order.
    auto* charted = create_runtime(context);
    const ludivra_statechart_state states[] = {{1U, 0U, 0U, 0U}, {2U, 0U, 0U, 0U}};
    const ludivra_statechart_transition transitions[] = {{9U, 1U, 7U, 2U, 0U, 1U, 0U, 0U}};
    const ludivra_statechart_action actions[] = {
        {9U, 1U, LUDIVRA_STATECHART_ACTION_TRANSITION},
        {2U, 2U, LUDIVRA_STATECHART_ACTION_ENTRY}};
    context.expect(ludivra_runtime_declare_statechart_handler(charted, LUDIVRA_STATECHART_HANDLER_GUARD, "guard.ready", 11U, 1U) == LUDIVRA_OK,
        "statechart guard is bound by semantic id");
    context.expect(ludivra_runtime_declare_statechart_handler(charted, LUDIVRA_STATECHART_HANDLER_ACTION, "action.transition", 17U, 1U) == LUDIVRA_OK,
        "statechart transition action is bound by semantic id");
    context.expect(ludivra_runtime_declare_statechart_handler(charted, LUDIVRA_STATECHART_HANDLER_ACTION, "action.enter", 12U, 2U) == LUDIVRA_OK,
        "statechart entry action is bound by semantic id");
    context.expect(ludivra_runtime_install_statechart(charted, states, 2U, transitions, 1U, actions, 2U, 1U) == LUDIVRA_OK,
        "statechart accepts guards and lifecycle action bindings");
    const auto source = statechart_gameplay();
    context.expect(ludivra_runtime_load_gameplay(charted, source.data(), static_cast<uint32_t>(source.size())) == LUDIVRA_OK,
        "statechart gameplay callbacks load");
    submit(context, charted, 7U, 0, 1U);
    context.expect(ludivra_runtime_step(charted, 1U) == LUDIVRA_OK, "guarded statechart transition commits");
    context.expect(integer_state(context, charted, 30U) == 11, "transition and entry actions commit through Lua commands");
    uint32_t trace_count = 0U;
    context.expect(ludivra_runtime_statechart_trace_count(charted, &trace_count) == LUDIVRA_OK && trace_count == 4U,
        "guarded statechart exposes ordered event, guard and lifecycle action traces");
    ludivra_statechart_trace traces[4]{};
    uint32_t traces_written = 0U;
    context.expect(ludivra_runtime_statechart_traces_write(charted, traces, 4U, &traces_written) == LUDIVRA_OK && traces_written == 4U &&
        traces[1].kind == LUDIVRA_STATECHART_TRACE_GUARD && traces[1].guard_id == 1U && traces[1].guard_passed == 1U &&
        traces[2].kind == LUDIVRA_STATECHART_TRACE_ACTION && traces[2].action_phase == 1U &&
        traces[3].kind == LUDIVRA_STATECHART_TRACE_ACTION && traces[3].action_phase == 2U,
        "statechart trace records retain guard outcome and action order across the C ABI");
    const auto replay = replay_archive(context, charted);
    context.expect(ludivra_runtime_verify_replay(charted, replay.data(), static_cast<uint32_t>(replay.size())) == LUDIVRA_OK,
        "guarded actions are replayed deterministically");
    ludivra_runtime_destroy(charted);
  }

  {
    // after_ticks advances with authoritative commits, never a presentation
    // clock, and the elapsed value travels in the save snapshot.
    auto* timed_chart = create_runtime(context);
    const ludivra_statechart_state states[] = {{1U, 0U, 0U, 0U}, {2U, 0U, 0U, 0U}};
    const ludivra_statechart_transition transitions[] = {{3U, 1U, 0U, 2U, 0U, 0U, 2U, 0U}};
    context.expect(ludivra_runtime_install_statechart(timed_chart, states, 2U, transitions, 1U, nullptr, 0U, 1U) == LUDIVRA_OK,
        "logical afterTicks transition installs");
    context.expect(ludivra_runtime_step(timed_chart, 1U) == LUDIVRA_OK, "first elapsed statechart tick commits");
    uint32_t active_state = 0;
    context.expect(ludivra_runtime_statechart_active(timed_chart, &active_state) == LUDIVRA_OK && active_state == 1U,
        "afterTicks does not fire early");
    const auto mid_save = save_archive(context, timed_chart);
    auto* restored = create_runtime(context);
    context.expect(ludivra_runtime_install_statechart(restored, states, 2U, transitions, 1U, nullptr, 0U, 1U) == LUDIVRA_OK,
        "restore runtime installs the elapsed chart definition");
    context.expect(ludivra_runtime_load_save(restored, mid_save.data(), static_cast<uint32_t>(mid_save.size())) == LUDIVRA_OK,
        "save restores elapsed statechart time");
    context.expect(ludivra_runtime_step(restored, 1U) == LUDIVRA_OK, "restored elapsed statechart advances");
    context.expect(ludivra_runtime_statechart_active(restored, &active_state) == LUDIVRA_OK && active_state == 2U,
        "afterTicks fires at the declared logical tick after restore");
    ludivra_runtime_destroy(restored);
    ludivra_runtime_destroy(timed_chart);
  }

  auto* scripted = create_runtime(context);
  const auto gameplay_source = counter_gameplay();
  context.expect(
      ludivra_runtime_load_gameplay(
          scripted, gameplay_source.data(), static_cast<uint32_t>(gameplay_source.size())) == LUDIVRA_OK,
      "sandboxed gameplay module loads");
  submit(context, scripted, 1U, 1000, 1U);
  submit(context, scripted, 2U, 1000, 2U);
  context.expect(ludivra_runtime_step(scripted, 1U) == LUDIVRA_OK, "Lua gameplay advances");
  context.expect(integer_state(context, scripted, 1U) == 1, "Lua changes state through commands");
  std::printf("wasm_equivalence_hash=%016" PRIx64 "\n", state_hash(context, scripted));

  {
    // ADR 0016 layer 1: state and queries bind once during module loading. The
    // callback only carries opaque references, never manifest names.
    auto* named = create_runtime(context);
    context.expect(
        ludivra_runtime_declare_symbol(named, LUDIVRA_SYMBOL_STATE, "score", 5U, 1U) == LUDIVRA_OK,
        "state symbol is declared");
    context.expect(
        ludivra_runtime_declare_symbol(named, LUDIVRA_SYMBOL_STATE, "score", 5U, 1U) == LUDIVRA_OK,
        "declaring the same symbol twice is idempotent");
    context.expect(
        ludivra_runtime_declare_symbol(named, LUDIVRA_SYMBOL_STATE, "score", 5U, 2U) == LUDIVRA_ERROR_SYMBOL_CONFLICT,
        "redeclaring a symbol with another key is a conflict");
    const auto symbol_source = symbol_gameplay();
    context.expect(
        ludivra_runtime_load_gameplay(
            named, symbol_source.data(), static_cast<uint32_t>(symbol_source.size())) == LUDIVRA_OK,
        "symbol gameplay loads");
    submit(context, named, 1U, 1000, 1U);
    context.expect(ludivra_runtime_step(named, 1U) == LUDIVRA_OK, "named state tick advances");
    context.expect(
        integer_state(context, named, 1U) == 1,
        "declared query reads state and exposes its one-read cost");

    auto* missing = create_runtime(context);
    context.expect(
        ludivra_runtime_declare_symbol(missing, LUDIVRA_SYMBOL_STATE, "score", 5U, 1U) == LUDIVRA_OK,
        "unknown-symbol scenario declares its known state");
    const auto missing_source = unknown_symbol_gameplay();
    context.expect(
        ludivra_runtime_load_gameplay(
            missing, missing_source.data(), static_cast<uint32_t>(missing_source.size())) == LUDIVRA_ERROR_SCRIPT,
        "an undeclared symbol fails while the module loads");
    context.expect(
        std::string(ludivra_runtime_last_error_code(missing)) == "SDK_SYMBOL_UNKNOWN",
        "the load failure carries a stable code");
    ludivra_runtime_destroy(missing);
    ludivra_runtime_destroy(named);
  }

  {
    // Logical time is the simulation tick, not a host clock. The first callback
    // sees tick one because it is executing the first commit.
    auto* timed = create_runtime(context);
    const auto source = time_gameplay();
    context.expect(
        ludivra_runtime_load_gameplay(timed, source.data(), static_cast<uint32_t>(source.size())) == LUDIVRA_OK,
        "logical-time gameplay loads");
    submit(context, timed, 1U, 0, 1U);
    context.expect(ludivra_runtime_step(timed, 1U) == LUDIVRA_OK, "logical-time callback advances");
    context.expect(integer_state(context, timed, 20U) == 1, "script reads the confirmed logical tick");
    ludivra_runtime_destroy(timed);
  }

  {
    // ADR 0017: content reaches gameplay from the pack, read-only, and a pack that
    // does not parse is refused instead of partially installed.
    const std::string pack =
        R"({"packFormatVersion":2,"generatorVersion":2,"sections":{"documents":{"sha256":"x","value":)"
        R"({"ember-vault.run":{"cards":[{"damage":6,"id":"card.strike"}]}}},"origin":{"sha256":"x","value":{}},)"
        R"("strings":{"sha256":"x","value":{}},"symbols":{"sha256":"x","value":{}},"migrations":{"sha256":"x","value":[]}}})";
    auto* content = create_runtime(context);
    context.expect(
        ludivra_runtime_declare_symbol(content, LUDIVRA_SYMBOL_STATE, "score", 5U, 1U) == LUDIVRA_OK,
        "content scenario declares its state");
    context.expect(
        ludivra_runtime_load_content_pack(content, pack.data(), static_cast<uint32_t>(pack.size())) == LUDIVRA_OK,
        "content pack loads");
    const auto content_source = content_gameplay();
    context.expect(
        ludivra_runtime_load_gameplay(
            content, content_source.data(), static_cast<uint32_t>(content_source.size())) == LUDIVRA_OK,
        "gameplay reads content at load time");
    submit(context, content, 1U, 0, 1U);
    context.expect(ludivra_runtime_step(content, 1U) == LUDIVRA_OK, "content value reaches the state");
    context.expect(integer_state(context, content, 1U) == 6, "the card damage came from the pack");
    submit(context, content, 2U, 0, 2U);
    context.expect(
        ludivra_runtime_step(content, 1U) == LUDIVRA_ERROR_SCRIPT,
        "writing to content fails the tick");
    context.expect(
        std::string(ludivra_runtime_last_error_code(content)) == "SDK_CONTENT_READ_ONLY",
        "the read-only failure carries its code");
    ludivra_runtime_destroy(content);

    const std::string legacy = R"({"packFormatVersion":1,"sections":{"documents":{"value":{}}}})";
    auto* outdated = create_runtime(context);
    context.expect(
        ludivra_runtime_load_content_pack(outdated, legacy.data(), static_cast<uint32_t>(legacy.size())) ==
            LUDIVRA_ERROR_CONTENT_PACK_INVALID,
        "an outdated content pack is refused");
    ludivra_runtime_destroy(outdated);

    const std::string incomplete = R"({"packFormatVersion":2,"sections":{"documents":{"value":{}}}})";
    auto* missing_migrations = create_runtime(context);
    context.expect(
        ludivra_runtime_load_content_pack(
            missing_migrations, incomplete.data(), static_cast<uint32_t>(incomplete.size())) ==
            LUDIVRA_ERROR_CONTENT_PACK_INVALID,
        "a v2 pack without its migration section is refused");
    ludivra_runtime_destroy(missing_migrations);

    auto* broken = create_runtime(context);
    const std::string malformed = R"({"packFormatVersion":2,"sections":)";
    context.expect(
        ludivra_runtime_load_content_pack(broken, malformed.data(), static_cast<uint32_t>(malformed.size())) ==
            LUDIVRA_ERROR_CONTENT_PACK_INVALID,
        "a truncated pack is refused");
    ludivra_runtime_destroy(broken);
  }

  {
    // ADR 0016 layer 1 timers: logical ticks, observable expiry and cancellation.
    auto* timed = create_runtime(context);
    context.expect(
        ludivra_runtime_declare_symbol(timed, LUDIVRA_SYMBOL_STATE, "score", 5U, 1U) == LUDIVRA_OK,
        "timer scenario declares its state");
    context.expect(
        ludivra_runtime_declare_symbol(timed, LUDIVRA_SYMBOL_TIMER, "attack.windup", 13U, 7U) == LUDIVRA_OK,
        "timer symbol is declared");
    const auto timer_source = timer_gameplay();
    context.expect(
        ludivra_runtime_load_gameplay(
            timed, timer_source.data(), static_cast<uint32_t>(timer_source.size())) == LUDIVRA_OK,
        "timer gameplay loads");

    submit(context, timed, 1U, 0, 1U);
    context.expect(ludivra_runtime_step(timed, 1U) == LUDIVRA_OK, "timer starts");
    submit(context, timed, 3U, 0, 2U);
    context.expect(ludivra_runtime_step(timed, 1U) == LUDIVRA_OK, "remaining is readable");
    context.expect(integer_state(context, timed, 1U) == 2, "remaining counts down in logical ticks");

    // Two more ticks reach the expiry, which fires on_timer once.
    context.expect(ludivra_runtime_step(timed, 2U) == LUDIVRA_OK, "timer reaches its expiry");
    context.expect(integer_state(context, timed, 1U) == 102, "expiry fires exactly once");
    context.expect(ludivra_runtime_step(timed, 3U) == LUDIVRA_OK, "later ticks do not refire");
    context.expect(integer_state(context, timed, 1U) == 102, "an expired timer is gone");

    // A cancelled timer never fires, and remaining reports its absence.
    submit(context, timed, 1U, 0, 3U);
    context.expect(ludivra_runtime_step(timed, 1U) == LUDIVRA_OK, "timer restarts");
    submit(context, timed, 2U, 0, 4U);
    context.expect(ludivra_runtime_step(timed, 1U) == LUDIVRA_OK, "timer is cancelled");
    submit(context, timed, 3U, 0, 5U);
    context.expect(ludivra_runtime_step(timed, 1U) == LUDIVRA_OK, "remaining after cancel is readable");
    context.expect(integer_state(context, timed, 1U) == 101, "cancelled timer reports no remaining");
    context.expect(ludivra_runtime_step(timed, 5U) == LUDIVRA_OK, "cancelled timer never fires");
    context.expect(integer_state(context, timed, 1U) == 101, "cancelled timer stayed cancelled");

    // A pending timer survives save and load.
    submit(context, timed, 1U, 0, 6U);
    context.expect(ludivra_runtime_step(timed, 1U) == LUDIVRA_OK, "timer starts before saving");
    const auto timer_archive = save_archive(context, timed);
    auto* resumed = create_runtime(context);
    context.expect(
        ludivra_runtime_declare_symbol(resumed, LUDIVRA_SYMBOL_STATE, "score", 5U, 1U) == LUDIVRA_OK,
        "resumed runtime declares its state");
    context.expect(
        ludivra_runtime_declare_symbol(resumed, LUDIVRA_SYMBOL_TIMER, "attack.windup", 13U, 7U) == LUDIVRA_OK,
        "resumed runtime declares its timer");
    context.expect(
        ludivra_runtime_load_gameplay(
            resumed, timer_source.data(), static_cast<uint32_t>(timer_source.size())) == LUDIVRA_OK,
        "resumed gameplay loads");
    context.expect(
        ludivra_runtime_load_save(
            resumed, timer_archive.data(), static_cast<uint32_t>(timer_archive.size())) == LUDIVRA_OK,
        "save with a pending timer loads");
    context.expect(ludivra_runtime_step(resumed, 3U) == LUDIVRA_OK, "resumed run reaches the expiry");
    context.expect(
        integer_state(context, resumed, 1U) == integer_state(context, timed, 1U) + 100,
        "the restored timer fired after the remaining ticks");

    ludivra_runtime_destroy(resumed);
    ludivra_runtime_destroy(timed);
  }

  {
    // ADR 0018 through the whole stack: draws and fixed-point reach the state, and
    // the stream position becomes part of the hash and of the save.
    auto* deterministic = create_runtime(context);
    const auto source = determinism_gameplay();
    context.expect(
        ludivra_runtime_load_gameplay(
            deterministic, source.data(), static_cast<uint32_t>(source.size())) == LUDIVRA_OK,
        "determinism gameplay loads");
    submit(context, deterministic, 1U, 2000, 1U);
    context.expect(ludivra_runtime_step(deterministic, 1U) == LUDIVRA_OK, "determinism tick advances");
    const auto roll = integer_state(context, deterministic, 10U);
    context.expect(roll >= 1 && roll <= 6, "ranged draw stays inside the declared range");
    context.expect(
        integer_state(context, deterministic, 11U) == 3000,
        "fixed-point multiply keeps the milli scale");
    const auto chance = integer_state(context, deterministic, 12U);
    context.expect(chance >= 0 && chance <= 1000, "unit draw stays in milli range");
    std::printf("wasm_determinism_hash=%016" PRIx64 "\n", state_hash(context, deterministic));

    // The same seed and the same inputs reproduce the same draws.
    auto* twin = create_runtime(context);
    context.expect(
        ludivra_runtime_load_gameplay(
            twin, source.data(), static_cast<uint32_t>(source.size())) == LUDIVRA_OK,
        "twin gameplay loads");
    submit(context, twin, 1U, 2000, 1U);
    context.expect(ludivra_runtime_step(twin, 1U) == LUDIVRA_OK, "twin tick advances");
    context.expect(
        state_hash(context, twin) == state_hash(context, deterministic),
        "same seed reproduces the same draws");

    // Restoring a save resumes the stream instead of replaying the first draw.
    const auto archive = save_archive(context, deterministic);
    auto* restored = create_runtime(context);
    context.expect(
        ludivra_runtime_load_gameplay(
            restored, source.data(), static_cast<uint32_t>(source.size())) == LUDIVRA_OK,
        "restored gameplay loads");
    context.expect(
        ludivra_runtime_load_save(restored, archive.data(), static_cast<uint32_t>(archive.size())) == LUDIVRA_OK,
        "save with stream positions loads");
    submit(context, restored, 1U, 2000, 2U);
    submit(context, deterministic, 1U, 2000, 2U);
    context.expect(ludivra_runtime_step(restored, 1U) == LUDIVRA_OK, "restored tick advances");
    context.expect(ludivra_runtime_step(deterministic, 1U) == LUDIVRA_OK, "original tick advances");
    context.expect(
        integer_state(context, restored, 10U) == integer_state(context, deterministic, 10U),
        "restored stream continues the same sequence");

    ludivra_runtime_destroy(restored);
    ludivra_runtime_destroy(twin);
    ludivra_runtime_destroy(deterministic);
  }

  auto save = save_archive(context, scripted);
  context.expect(
      ludivra_runtime_save_write(scripted, save.data(), 1U) ==
          LUDIVRA_ERROR_BUFFER_TOO_SMALL,
      "undersized save buffers are rejected");
  auto* restored = create_runtime(context);
  context.expect(
      ludivra_runtime_load_gameplay(
          restored, gameplay_source.data(), static_cast<uint32_t>(gameplay_source.size())) == LUDIVRA_OK,
      "restored runtime loads gameplay");
  context.expect(
      ludivra_runtime_load_save(restored, save.data(), static_cast<uint32_t>(save.size())) == LUDIVRA_OK,
      "valid save loads");
  context.expect(integer_state(context, restored, 1U) == 1, "save restores logical state");
  context.expect(
      state_hash(context, restored) == state_hash(context, scripted),
      "save restores the exact deterministic hash");

  auto corrupt_save = save;
  corrupt_save[8] ^= 0x01U;
  context.expect(
      ludivra_runtime_load_save(restored, corrupt_save.data(), static_cast<uint32_t>(corrupt_save.size())) ==
          LUDIVRA_ERROR_ARCHIVE_INVALID,
      "corrupt saves are rejected");
  context.expect(integer_state(context, restored, 1U) == 1, "failed save load is transactional");

  const auto replay = replay_archive(context, scripted);
  context.expect(
      ludivra_runtime_verify_replay(scripted, replay.data(), static_cast<uint32_t>(replay.size())) ==
          LUDIVRA_OK,
      "replay reproduces the expected hash");
  auto corrupt_replay = replay;
  corrupt_replay[8] ^= 0x01U;
  context.expect(
      ludivra_runtime_verify_replay(
          scripted, corrupt_replay.data(), static_cast<uint32_t>(corrupt_replay.size())) ==
          LUDIVRA_ERROR_ARCHIVE_INVALID,
      "corrupt replays are rejected");

  submit(context, restored, 1U, 1000, 3U);
  context.expect(
      ludivra_runtime_load_save(restored, save.data(), static_cast<uint32_t>(save.size())) ==
          LUDIVRA_ERROR_PENDING_INPUTS,
      "save loading cannot discard pending inputs");

  constexpr char forbidden_gameplay[] = R"(
return { on_input = function() return os.time() end }
)";
  context.expect(
      ludivra_runtime_load_gameplay(
          scripted, forbidden_gameplay, static_cast<uint32_t>(sizeof(forbidden_gameplay) - 1U)) == LUDIVRA_OK,
      "module with deferred forbidden access loads");
  submit(context, scripted, 1U, 1000, 3U);
  context.expect(
      ludivra_runtime_step(scripted, 1U) == LUDIVRA_ERROR_SCRIPT,
      "operating-system access is unavailable in gameplay");
  context.expect(
      ludivra_runtime_last_error(scripted)[0] != '\0',
      "script failures expose a diagnostic message");

  auto* limited = create_runtime(context, 1U);
  submit(context, limited, 1U, 1000, 1U);
  const ludivra_logical_input excess_input{sizeof(ludivra_logical_input), 2U, 1000, 2U};
  context.expect(
      ludivra_runtime_submit_input(limited, &excess_input) == LUDIVRA_ERROR_INPUT_LIMIT,
      "pending input limit is enforced");

  auto* feedback = create_runtime(context);
  const auto feedback_source = fixture("feedback.lua");
  context.expect(
      ludivra_runtime_load_gameplay(
          feedback, feedback_source.data(), static_cast<uint32_t>(feedback_source.size())) == LUDIVRA_OK,
      "feedback gameplay loads");
  submit(context, feedback, 1U, 1000, 1U);
  context.expect(ludivra_runtime_step(feedback, 1U) == LUDIVRA_OK, "feedback tick advances");
  uint32_t event_count = 0;
  context.expect(
      ludivra_runtime_presentation_event_count(feedback, &event_count) == LUDIVRA_OK &&
          event_count == 3U,
      "feedback commands produce one ordered event batch");
  std::vector<ludivra_presentation_event> events(event_count);
  context.expect(
      ludivra_runtime_presentation_events_write(feedback, events.data(), 2U, &event_count) ==
          LUDIVRA_ERROR_BUFFER_TOO_SMALL && event_count == 3U,
      "feedback batch rejects undersized buffers without clearing events");
  context.expect(
      ludivra_runtime_presentation_events_write(
          feedback, events.data(), static_cast<uint32_t>(events.size()), &event_count) == LUDIVRA_OK,
      "feedback batch is copied in one call");
  context.expect(
      events[0].type == LUDIVRA_PRESENTATION_AUDIO_PLAY && events[0].id == 7U &&
          events[0].value_milli == 750 && events[0].sequence == 1U,
      "audio play event preserves semantic data");
  context.expect(
      events[1].type == LUDIVRA_PRESENTATION_EFFECT_SPAWN && events[1].id == 9U &&
          events[1].value_milli == 1250 && events[1].x_milli == 1000 &&
          events[1].y_milli == -500 && events[1].z_milli == 250 && events[1].sequence == 2U,
      "effect event preserves fixed-point position and intensity");
  context.expect(
      events[2].type == LUDIVRA_PRESENTATION_AUDIO_STOP && events[2].sequence == 3U,
      "audio stop remains ordered after the effect");
  context.expect(
      ludivra_runtime_presentation_events_clear(feedback) == LUDIVRA_OK,
      "feedback batch is explicitly acknowledged");
  context.expect(
      ludivra_runtime_presentation_event_count(feedback, &event_count) == LUDIVRA_OK &&
          event_count == 0U,
      "acknowledged feedback events are removed");
  const auto feedback_save = save_archive(context, feedback);
  context.expect(
      ludivra_runtime_load_save(
          feedback, feedback_save.data(), static_cast<uint32_t>(feedback_save.size())) == LUDIVRA_OK,
      "feedback save reload succeeds");
  submit(context, feedback, 1U, 1000, 2U);
  context.expect(ludivra_runtime_step(feedback, 1U) == LUDIVRA_OK, "feedback resumes after load");
  events.resize(3U);
  context.expect(
      ludivra_runtime_presentation_events_write(feedback, events.data(), 3U, &event_count) == LUDIVRA_OK &&
          event_count == 3U && events[0].sequence == 4U,
      "presentation sequence remains monotonic across in-process save loads");

  std::printf("state_hash=%016" PRIx64 "\n", state_hash(context, first));
  ludivra_runtime_destroy(first);
  ludivra_runtime_destroy(second);
  ludivra_runtime_destroy(limited);
  ludivra_runtime_destroy(restored);
  ludivra_runtime_destroy(feedback);
  ludivra_runtime_destroy(scripted);
  return context.failures == 0 ? 0 : 1;
}
