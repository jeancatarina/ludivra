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

std::string determinism_gameplay() {
  return fixture("determinism.lua");
}

std::string symbol_gameplay() {
  return fixture("symbols.lua");
}

std::string timer_gameplay() {
  return fixture("timers.lua");
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
  context.expect(ludivra_runtime_abi_version() == 3U, "ABI version is stable");
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

  {
    // ADR 0016 layer 1: state reached by declared name, and an undeclared name
    // failing the tick instead of silently reading key zero.
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
    context.expect(integer_state(context, named, 1U) == 5, "state written by name reaches the key");
    submit(context, named, 2U, 1000, 2U);
    context.expect(
        ludivra_runtime_step(named, 1U) == LUDIVRA_ERROR_SCRIPT,
        "an undeclared symbol fails the tick");
    context.expect(
        std::string(ludivra_runtime_last_error_code(named)) == "SDK_SYMBOL_UNKNOWN",
        "the script failure carries a stable code");
    ludivra_runtime_destroy(named);
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
