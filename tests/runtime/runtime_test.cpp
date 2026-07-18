#include "ludivra/runtime.h"

#include <cinttypes>
#include <cstdio>
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

}  // namespace

int main() {
  TestContext context;
  context.expect(ludivra_runtime_abi_version() == 2U, "ABI version is stable");
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
