#pragma once

#include "command_buffer.hpp"
#include "logical_timers.hpp"
#include "random_streams.hpp"
#include "state_archive.hpp"
#include "statechart_runtime.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>

struct lua_State;

namespace ludivra::kernel {

/// Kinds of declared symbol. One table serves every kind so a name is always
/// resolved the same way, whatever it identifies.
enum class SymbolKind : std::uint8_t { state, timer };

/// Semantic name to authoritative key, per kind. Built once when the host declares
/// the manifest, then read by name: gameplay never repeats a numeric key.
using SymbolTable = std::unordered_map<std::string, std::uint32_t>;

struct SymbolTables final {
  SymbolTable state;
  SymbolTable timer;

  [[nodiscard]] const SymbolTable& of(const SymbolKind kind) const noexcept {
    return kind == SymbolKind::state ? state : timer;
  }

  [[nodiscard]] SymbolTable& of(const SymbolKind kind) noexcept {
    return kind == SymbolKind::state ? state : timer;
  }
};

struct ScriptInput final {
  std::uint32_t action_id;
  std::int32_t value_milli;
  std::uint64_t sequence;
};

class LuaSandbox final {
 public:
  LuaSandbox();
  ~LuaSandbox();
  LuaSandbox(const LuaSandbox&) = delete;
  LuaSandbox& operator=(const LuaSandbox&) = delete;

  [[nodiscard]] bool load(std::string_view source, const SymbolTables& symbols);
  /// Installs the compiled content pack for `SDK.content.get`. It must
  /// happen before the gameplay module loads, because a module reads content at
  /// load time as well as during a tick.
  [[nodiscard]] bool load_content_pack(std::string_view bytes);
  [[nodiscard]] bool on_input(
      const ScriptInput& input,
      std::uint64_t logical_tick,
      const IntegerState& state,
      const SymbolTables& symbols,
      const LogicalTimerStore& timers,
      RandomStreamRegistry& random_streams,
      CommandBuffer& commands);

  /// Optional `on_timer(ctx, event)` in the gameplay module. A module without it
  /// simply ignores expirations; a module with it receives the timer name.
  [[nodiscard]] bool on_timer(
      std::string_view timer_name,
      std::uint64_t logical_tick,
      const IntegerState& state,
      const SymbolTables& symbols,
      const LogicalTimerStore& timers,
      RandomStreamRegistry& random_streams,
      CommandBuffer& commands);
  /// Registered statechart guards run through the ordinary Lua SDK context, but
  /// the command buffer is withheld so they remain read-only queries.
  [[nodiscard]] bool statechart_guard(
      std::string_view guard_name,
      const StatechartTransition& transition,
      std::uint64_t logical_tick,
      const IntegerState& state,
      const SymbolTables& symbols,
      const LogicalTimerStore& timers,
      RandomStreamRegistry& random_streams,
      CommandBuffer& commands,
      bool& passed);
  /// Statechart actions use the same buffered command path as on_input and
  /// receive the transition context that selected them.
  [[nodiscard]] bool statechart_action(
      std::string_view action_name,
      const StatechartActionInvocation& invocation,
      std::uint64_t logical_tick,
      const IntegerState& state,
      const SymbolTables& symbols,
      const LogicalTimerStore& timers,
      RandomStreamRegistry& random_streams,
      CommandBuffer& commands);
  [[nodiscard]] const std::string& last_error() const noexcept;
  /// Stable code extracted from the script failure, empty when the error carries
  /// none. It is what lets a diagnostic be reported by code instead of by prose.
  [[nodiscard]] const std::string& last_error_code() const noexcept;
  /// Boundary test for the versioned public SDK. It enumerates the actual Lua
  /// tables that scripts can reach and compares them to the generated contract.
  [[nodiscard]] static bool sdk_contract_boundary_valid();

 private:
  void record_error(std::string message);

  lua_State* state_{nullptr};
  int behavior_reference_{-2};
  std::string last_error_;
  std::string last_error_code_;
};

}  // namespace ludivra::kernel
