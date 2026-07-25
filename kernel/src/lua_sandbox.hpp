#pragma once

#include "command_buffer.hpp"
#include "logical_timers.hpp"
#include "random_streams.hpp"
#include "state_archive.hpp"

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

  [[nodiscard]] bool load(std::string_view source);
  [[nodiscard]] bool on_input(
      const ScriptInput& input,
      const IntegerState& state,
      const SymbolTables& symbols,
      const LogicalTimerStore& timers,
      RandomStreamRegistry& random_streams,
      CommandBuffer& commands);

  /// Optional `on_timer(ctx, event)` in the gameplay module. A module without it
  /// simply ignores expirations; a module with it receives the timer name.
  [[nodiscard]] bool on_timer(
      std::string_view timer_name,
      const IntegerState& state,
      const SymbolTables& symbols,
      const LogicalTimerStore& timers,
      RandomStreamRegistry& random_streams,
      CommandBuffer& commands);
  [[nodiscard]] const std::string& last_error() const noexcept;

 private:
  lua_State* state_{nullptr};
  int behavior_reference_{-2};
  std::string last_error_;
};

}  // namespace ludivra::kernel
