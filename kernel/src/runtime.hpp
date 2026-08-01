#pragma once

#include "command_buffer.hpp"
#include "lua_sandbox.hpp"
#include "random_streams.hpp"
#include "region_storage.hpp"
#include "statechart_runtime.hpp"

#include <cstdint>
#include <map>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace ludivra::kernel {

struct RuntimeConfig final {
  std::uint32_t tick_rate_hz;
  std::uint32_t max_pending_inputs;
  std::uint64_t seed;
};

/** Configuration for the opt-in regional persistence owned by Runtime. The
 * generator identity is checked before restored deltas ever reach gameplay. */
struct RuntimeRegionStorageConfig final {
  RegionStorageConfig storage;
  std::string generator_id;
  std::uint32_t generator_version;
};

/** A delta confirmed by the current authoritative tick. It contains only an
 * authored chunk overlay, never the procedural base chunk. Consumers drain the
 * transient list after publishing it to an approved transport. */
struct RuntimeRegionDelta final {
  StoredRegionKey region;
  StoredChunkDelta delta;
  std::uint64_t revision;
};

struct LogicalInput final {
  std::uint32_t action_id;
  std::int32_t value_milli;
  std::uint64_t sequence;
};

enum class StatechartHandlerKind : std::uint8_t { guard, action };
enum class StatechartTraceKind : std::uint8_t { event, guard, action };

struct StatechartTrace final {
  StatechartTraceKind kind;
  std::uint64_t tick;
  std::uint32_t event;
  std::uint32_t transition;
  std::uint32_t guard;
  std::uint32_t action;
  std::uint32_t previous;
  std::uint32_t active;
  bool guard_passed;
  std::optional<StatechartActionPhase> action_phase;
  StatechartError error;
};

enum class PresentationEventKind : std::uint8_t {
  audio_play,
  audio_stop,
  effect_spawn
};

struct PresentationEvent final {
  PresentationEventKind kind;
  std::uint32_t id;
  std::int32_t value_milli;
  std::int32_t x_milli;
  std::int32_t y_milli;
  std::int32_t z_milli;
  std::uint64_t sequence;
};

enum class RuntimeError : std::uint8_t {
  none,
  symbol_conflict,
  content_pack_invalid,
  tick_overflow,
  input_limit,
  script_failure,
  integer_overflow,
  archive_invalid,
  replay_mismatch,
  pending_inputs,
  presentation_limit
  , statechart_invalid
  , statechart_event_unhandled
  , region_storage_unconfigured
  , region_storage_failure
  , region_identity_mismatch
};

class Runtime final {
 public:
  explicit Runtime(RuntimeConfig config);

  [[nodiscard]] RuntimeError submit_input(LogicalInput input);
  [[nodiscard]] RuntimeError step(std::uint32_t tick_count);
  [[nodiscard]] std::uint64_t tick() const noexcept;
  [[nodiscard]] std::uint64_t state_hash() const noexcept;
  [[nodiscard]] RuntimeError load_gameplay(std::string_view source);
  [[nodiscard]] RuntimeError load_content_pack(std::string_view bytes);
  [[nodiscard]] RuntimeError configure_region_storage(RuntimeRegionStorageConfig config);
  /// Declares the semantic name of an integer state, so gameplay stops repeating
  /// the numeric keys the manifest already owns. Declaring twice with different
  /// keys is a defect, not a redefinition.
  [[nodiscard]] RuntimeError declare_symbol(SymbolKind kind, std::string_view name, std::uint32_t key);
  [[nodiscard]] RuntimeError declare_statechart_handler(StatechartHandlerKind kind, std::string_view name, std::uint32_t id);
  [[nodiscard]] RuntimeError install_statechart(std::vector<StatechartState> states, std::vector<StatechartTransition> transitions, std::uint32_t initial);
  [[nodiscard]] std::uint32_t statechart_active() const noexcept;
  [[nodiscard]] std::int64_t integer_state(std::uint32_t key) const noexcept;
  [[nodiscard]] std::vector<std::uint8_t> save() const;
  [[nodiscard]] RuntimeError load_save(std::span<const std::uint8_t> bytes);
  [[nodiscard]] std::vector<std::uint8_t> replay() const;
  [[nodiscard]] RuntimeError verify_replay(std::span<const std::uint8_t> bytes) const;
  [[nodiscard]] const std::vector<PresentationEvent>& presentation_events() const noexcept;
  void clear_presentation_events() noexcept;
  [[nodiscard]] const std::vector<StatechartTrace>& statechart_traces() const noexcept;
  void clear_statechart_traces() noexcept;
  [[nodiscard]] const std::vector<RuntimeRegionDelta>& committed_region_deltas() const noexcept;
  void clear_committed_region_deltas() noexcept;
  [[nodiscard]] const std::string& last_error() const noexcept;
  [[nodiscard]] const std::string& last_error_code() const noexcept;

 private:
  static void mix_byte(std::uint64_t& hash, std::uint8_t value) noexcept;
  static void mix_u32(std::uint64_t& hash, std::uint32_t value) noexcept;
  static void mix_u64(std::uint64_t& hash, std::uint64_t value) noexcept;
  [[nodiscard]] RuntimeError commit_tick();
  [[nodiscard]] RuntimeError fire_expired_timers();
  [[nodiscard]] RuntimeError execute_statechart_result(const StatechartResult& result);
  void record_statechart_result(std::uint32_t event, const StatechartResult& result);
  [[nodiscard]] std::optional<bool> evaluate_statechart_guard(std::uint32_t guard, const StatechartTransition& transition);
  [[nodiscard]] std::string timer_name(std::uint32_t key) const;
  [[nodiscard]] RuntimeError apply_commands();
  [[nodiscard]] RuntimeError configure_region_storage(RuntimeRegionStorageConfig config, bool writable);
  [[nodiscard]] RuntimeError restore_region_references(std::span<const RegionSaveReference> references);
  [[nodiscard]] RuntimeError apply_region_deltas(std::uint64_t& hash);

  RuntimeConfig config_;
  std::uint64_t tick_{0};
  std::uint64_t state_hash_{14695981039346656037ULL};
  std::uint32_t max_pending_inputs_;
  std::vector<LogicalInput> pending_inputs_;
  IntegerState integer_state_;
  SymbolTables symbols_;
  LogicalTimerStore timers_;
  RandomStreamRegistry random_streams_;
  CommandBuffer commands_;
  StatechartRuntime statechart_;
  std::vector<StatechartState> statechart_states_;
  std::vector<StatechartTransition> statechart_transitions_;
  std::uint32_t statechart_initial_{0};
  std::map<std::uint32_t, std::string> statechart_guards_;
  std::map<std::uint32_t, std::string> statechart_actions_;
  LuaSandbox lua_;
  std::string gameplay_source_;
  std::string content_pack_source_;
  std::optional<RuntimeRegionStorageConfig> region_storage_config_;
  std::optional<RegionStorage> region_storage_;
  std::map<StoredRegionKey, StoredRegion> loaded_regions_;
  std::map<StoredRegionKey, RegionSaveReference> region_references_;
  std::vector<RuntimeRegionDelta> committed_region_deltas_;
  bool region_storage_writable_{true};
  SavedState replay_initial_state_;
  std::vector<ReplayFrame> replay_frames_;
  std::vector<PresentationEvent> presentation_events_;
  std::vector<StatechartTrace> statechart_traces_;
  std::uint64_t next_presentation_sequence_{1};
};

}  // namespace ludivra::kernel
