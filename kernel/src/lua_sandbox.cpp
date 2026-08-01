#include "lua_sandbox.hpp"

#include "content_pack.hpp"
#include "fixed_point.hpp"
#include "generated/lua_sdk_contract.hpp"

#include <algorithm>
#include <cstring>
#include <limits>
#include <new>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

namespace ludivra::kernel {
namespace {

constexpr int instruction_budget = 100'000;
constexpr char execution_context_key = 0;
constexpr char module_load_context_key = 0;
constexpr char symbol_ref_metatable[] = "ludivra.sdk.symbol-ref.v1";
constexpr char query_metatable[] = "ludivra.sdk.query.v1";

struct ExecutionContext final {
  std::uint64_t logical_tick;
  const IntegerState* state;
  const SymbolTables* symbols;
  const LogicalTimerStore* timers;
  RandomStreamRegistry* random_streams;
  CommandBuffer* commands;
  bool commands_allowed;
};

struct ModuleLoadContext final {
  const SymbolTables* symbols;
};

struct LuaSymbolRef final {
  SymbolKind kind;
  std::uint32_t key;
};

struct LuaQueryField final {
  std::string name;
  std::uint32_t key;
};

struct LuaQuery final {
  std::vector<LuaQueryField> fields;
};

std::uint32_t checked_key(lua_State* state, const int index) {
  const auto key = luaL_checkinteger(state, index);
  if (key < 0 || static_cast<lua_Unsigned>(key) > std::numeric_limits<std::uint32_t>::max()) {
    luaL_argerror(state, index, "state key must be an unsigned 32-bit integer");
  }
  return static_cast<std::uint32_t>(key);
}

std::int32_t checked_milli(lua_State* state, const int index, const char* message) {
  const auto value = luaL_checkinteger(state, index);
  if (value < std::numeric_limits<std::int32_t>::min() ||
      value > std::numeric_limits<std::int32_t>::max()) {
    luaL_argerror(state, index, message);
  }
  return static_cast<std::int32_t>(value);
}

std::int32_t checked_i32(lua_State* state, const int index, const char* message) {
  const auto value = luaL_checkinteger(state, index);
  if (value < std::numeric_limits<std::int32_t>::min() ||
      value > std::numeric_limits<std::int32_t>::max()) {
    luaL_argerror(state, index, message);
  }
  return static_cast<std::int32_t>(value);
}

ExecutionContext& context(lua_State* state) {
  lua_pushlightuserdata(state, const_cast<char*>(&execution_context_key));
  lua_gettable(state, LUA_REGISTRYINDEX);
  auto* value = static_cast<ExecutionContext*>(lua_touserdata(state, -1));
  lua_pop(state, 1);
  if (value == nullptr) {
    luaL_error(state, "gameplay context is unavailable");
  }
  return *value;
}

ModuleLoadContext& module_load_context(lua_State* state) {
  lua_pushlightuserdata(state, const_cast<char*>(&module_load_context_key));
  lua_gettable(state, LUA_REGISTRYINDEX);
  auto* value = static_cast<ModuleLoadContext*>(lua_touserdata(state, -1));
  lua_pop(state, 1);
  if (value == nullptr) {
    luaL_error(state, "SDK_SYMBOL_NOT_DECLARED: symbols must bind while gameplay loads");
  }
  return *value;
}

void set_module_load_context(lua_State* state, ModuleLoadContext* value) {
  lua_pushlightuserdata(state, const_cast<char*>(&module_load_context_key));
  lua_pushlightuserdata(state, value);
  lua_settable(state, LUA_REGISTRYINDEX);
}

LuaSymbolRef* checked_symbol_ref(lua_State* state, const int index, const SymbolKind expected) {
  auto* value = static_cast<LuaSymbolRef*>(luaL_testudata(state, index, symbol_ref_metatable));
  if (value == nullptr || value->kind != expected) {
    luaL_error(state, "SDK_SYMBOL_NOT_DECLARED: expected a declared %s symbol",
        expected == SymbolKind::state ? "state" : "timer");
    return nullptr;
  }
  return value;
}

LuaQuery* checked_query(lua_State* state, const int index) {
  auto* value = static_cast<LuaQuery*>(luaL_testudata(state, index, query_metatable));
  if (value == nullptr) {
    luaL_error(state, "SDK_SYMBOL_NOT_DECLARED: expected a declared query");
    return nullptr;
  }
  return value;
}

void push_symbol_ref(lua_State* state, const SymbolKind kind, const std::uint32_t key) {
  auto* value = static_cast<LuaSymbolRef*>(lua_newuserdatauv(state, sizeof(LuaSymbolRef), 0));
  value->kind = kind;
  value->key = key;
  luaL_getmetatable(state, symbol_ref_metatable);
  lua_setmetatable(state, -2);
}

int query_get_i64(lua_State* state) {
  const auto key = checked_key(state, 2);
  const auto& values = *context(state).state;
  const auto found = values.find(key);
  lua_pushinteger(state, found == values.end() ? 0 : found->second);
  return 1;
}

int commands_add_i64(lua_State* state) {
  const auto key = checked_key(state, 2);
  const auto delta = static_cast<std::int64_t>(luaL_checkinteger(state, 3));
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->add_integer(key, delta);
  } catch (...) {
    return luaL_error(state, "unable to allocate gameplay command");
  }
  return 0;
}

int commands_play_audio(lua_State* state) {
  const auto id = checked_key(state, 2);
  const auto volume = checked_milli(state, 3, "volume must be a signed 32-bit fixed-point value");
  if (volume < 0 || volume > 1000) {
    return luaL_argerror(state, 3, "volume must be between 0 and 1000");
  }
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->play_audio(id, volume);
  } catch (...) {
    return luaL_error(state, "unable to allocate audio command");
  }
  return 0;
}

int commands_stop_audio(lua_State* state) {
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->stop_audio(checked_key(state, 2));
  } catch (...) {
    return luaL_error(state, "unable to allocate audio command");
  }
  return 0;
}

int commands_spawn_effect(lua_State* state) {
  const auto id = checked_key(state, 2);
  const auto intensity = checked_milli(state, 3, "intensity must be a signed 32-bit fixed-point value");
  if (intensity < 0 || intensity > 10'000) {
    return luaL_argerror(state, 3, "intensity must be between 0 and 10000");
  }
  const auto x = checked_milli(state, 4, "x must be a signed 32-bit fixed-point value");
  const auto y = checked_milli(state, 5, "y must be a signed 32-bit fixed-point value");
  const auto z = checked_milli(state, 6, "z must be a signed 32-bit fixed-point value");
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->spawn_effect(id, intensity, x, y, z);
  } catch (...) {
    return luaL_error(state, "unable to allocate effect command");
  }
  return 0;
}

/// Persists an explicit player-authored delta, never a generated chunk base.
/// Coordinates name a semantic region and one local chunk delta; bytes are kept
/// opaque so game formats stay outside the engine's generic storage layer.
int world_set_delta(lua_State* state) {
  const auto dimension = luaL_checkinteger(state, 2);
  if (dimension < 0 || dimension > std::numeric_limits<std::uint16_t>::max()) {
    return luaL_argerror(state, 2, "region dimension must be an unsigned 16-bit integer");
  }
  std::size_t payload_size = 0U;
  const char* payload = luaL_checklstring(state, 9, &payload_size);
  if (payload_size > 64U * 1024U) {
    return luaL_argerror(state, 9, "region delta payload exceeds 65536 bytes");
  }
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->set_region_delta(
        {static_cast<std::uint16_t>(dimension),
            checked_i32(state, 3, "region x must be a signed 32-bit integer"),
            checked_i32(state, 4, "region y must be a signed 32-bit integer"),
            checked_i32(state, 5, "region z must be a signed 32-bit integer")},
        {checked_i32(state, 6, "chunk x must be a signed 32-bit integer"),
            checked_i32(state, 7, "chunk y must be a signed 32-bit integer"),
            checked_i32(state, 8, "chunk z must be a signed 32-bit integer"),
            {reinterpret_cast<const std::uint8_t*>(payload), reinterpret_cast<const std::uint8_t*>(payload) + payload_size}});
  } catch (...) {
    return luaL_error(state, "unable to allocate region delta command");
  }
  return 0;
}

/// The only lookup by semantic name happens while the module is loading. A bound
/// userdata carries the key into every later callback, so no tick can perform a
/// string lookup against the manifest table.
int bind_symbol(lua_State* state, const SymbolKind kind) {
  std::size_t length = 0;
  const char* text = luaL_checklstring(state, 1, &length);
  const auto& symbols = module_load_context(state).symbols->of(kind);
  const auto found = symbols.find(std::string(text, length));
  if (found == symbols.end()) {
    luaL_error(state, "SDK_SYMBOL_UNKNOWN: %s", text);
  }
  push_symbol_ref(state, kind, found->second);
  return 1;
}

int sdk_bind_state(lua_State* state) {
  return bind_symbol(state, SymbolKind::state);
}

int sdk_bind_timer(lua_State* state) {
  return bind_symbol(state, SymbolKind::timer);
}

int sdk_query_declare(lua_State* state) {
  if (!lua_istable(state, 1)) {
    return luaL_argerror(state, 1, "query fields must be a table of declared state symbols");
  }
  std::vector<LuaQueryField> fields;
  lua_pushnil(state);
  while (lua_next(state, 1) != 0) {
    if (fields.size() >= contract::lua_sdk_maximum_query_fields) {
      return luaL_error(state, "SDK_QUERY_TOO_BROAD: query exceeds %zu state reads",
          contract::lua_sdk_maximum_query_fields);
    }
    std::size_t length = 0;
    const char* name = luaL_checklstring(state, -2, &length);
    const auto* symbol = checked_symbol_ref(state, -1, SymbolKind::state);
    if (symbol == nullptr) return 0;
    fields.push_back({std::string(name, length), symbol->key});
    lua_pop(state, 1);
  }
  if (fields.empty()) {
    return luaL_error(state, "SDK_QUERY_TOO_BROAD: query must declare at least one state read");
  }
  std::sort(fields.begin(), fields.end(), [](const auto& left, const auto& right) {
    return left.name < right.name;
  });
  auto* query = static_cast<LuaQuery*>(lua_newuserdatauv(state, sizeof(LuaQuery), 0));
  new (query) LuaQuery{std::move(fields)};
  luaL_getmetatable(state, query_metatable);
  lua_setmetatable(state, -2);
  return 1;
}

int sdk_content_get(lua_State* state) {
  std::size_t length = 0;
  const char* id = luaL_checklstring(state, 1, &length);
  std::string error;
  if (!ContentPack::push_document(state, std::string_view(id, length), error)) {
    return luaL_error(state, "%s: content document is unavailable", error.c_str());
  }
  return 1;
}

int query_read(lua_State* state) {
  const auto* query = checked_query(state, 2);
  if (query == nullptr) return 0;
  const auto& values = *context(state).state;
  lua_createtable(state, 0, static_cast<int>(query->fields.size()));
  for (const auto& field : query->fields) {
    const auto found = values.find(field.key);
    lua_pushlstring(state, field.name.data(), field.name.size());
    lua_pushinteger(state, found == values.end() ? 0 : found->second);
    lua_rawset(state, -3);
  }
  return 1;
}

int query_cost(lua_State* state) {
  const auto* query = checked_query(state, 2);
  if (query == nullptr) return 0;
  lua_pushinteger(state, static_cast<lua_Integer>(query->fields.size()));
  return 1;
}

int commands_add(lua_State* state) {
  const auto* symbol = checked_symbol_ref(state, 2, SymbolKind::state);
  if (symbol == nullptr) return 0;
  const auto value = luaL_checkinteger(state, 3);
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->add_integer(symbol->key, value);
  } catch (...) {
    return luaL_error(state, "unable to allocate state command");
  }
  return 0;
}

/// Starts or restarts a timer measured in logical ticks. Zero ticks is refused:
/// an immediate expiry is a call, not a timer.
int timers_start(lua_State* state) {
  const auto* symbol = checked_symbol_ref(state, 2, SymbolKind::timer);
  if (symbol == nullptr) return 0;
  const auto ticks = luaL_checkinteger(state, 3);
  if (ticks <= 0) {
    return luaL_argerror(state, 3, "timer ticks must be positive");
  }
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->start_timer(symbol->key, static_cast<std::uint64_t>(ticks));
  } catch (...) {
    return luaL_error(state, "unable to allocate timer command");
  }
  return 0;
}

int timers_cancel(lua_State* state) {
  const auto* symbol = checked_symbol_ref(state, 2, SymbolKind::timer);
  if (symbol == nullptr) return 0;
  try {
    auto& execution = context(state);
    if (!execution.commands_allowed) return luaL_error(state, "STATECHART_GUARD_MUTATION_FORBIDDEN: guards are read-only");
    execution.commands->cancel_timer(symbol->key);
  } catch (...) {
    return luaL_error(state, "unable to allocate timer command");
  }
  return 0;
}

/// Remaining ticks, or nil when the timer is not running. Cancellation and expiry
/// are therefore observable from the script itself.
int timers_remaining(lua_State* state) {
  const auto* symbol = checked_symbol_ref(state, 2, SymbolKind::timer);
  if (symbol == nullptr) return 0;
  const auto remaining = context(state).timers->remaining(symbol->key);
  if (!remaining.has_value()) {
    lua_pushnil(state);
    return 1;
  }
  lua_pushinteger(state, static_cast<lua_Integer>(*remaining));
  return 1;
}

std::string_view checked_domain(lua_State* state, const int index) {
  std::size_t length = 0;
  const char* text = luaL_checklstring(state, index, &length);
  if (length == 0 || length > 128) {
    luaL_argerror(state, index, "stream domain must be between 1 and 128 characters");
  }
  return std::string_view(text, length);
}

std::int64_t fixed_result_or_error(lua_State* state, const FixedResult result) {
  switch (result.error) {
    case FixedError::none:
      return result.value;
    case FixedError::overflow:
      luaL_error(state, "fixed-point overflow");
      break;
    case FixedError::divide_by_zero:
      luaL_error(state, "fixed-point division by zero");
      break;
    case FixedError::scale_unsupported:
      luaL_error(state, "fixed-point scale is not supported");
      break;
  }
  return 0;
}

/// Draw an inclusive integer range from a named stream. Domain separation means a
/// new call site never shifts the sequence another system already consumed.
int random_range(lua_State* state) {
  const auto domain = checked_domain(state, 2);
  const auto minimum = luaL_checkinteger(state, 3);
  const auto maximum = luaL_checkinteger(state, 4);
  const auto instance = static_cast<std::uint64_t>(luaL_optinteger(state, 5, 0));
  if (maximum < minimum) {
    return luaL_argerror(state, 4, "maximum must not be smaller than minimum");
  }
  auto& stream = context(state).random_streams->stream(domain, instance);
  lua_pushinteger(state, stream.range(minimum, maximum));
  return 1;
}

/// Draw a unit value in the declared milli scale, so gameplay never sees a float.
int random_unit_milli(lua_State* state) {
  const auto domain = checked_domain(state, 2);
  const auto instance = static_cast<std::uint64_t>(luaL_optinteger(state, 3, 0));
  auto& stream = context(state).random_streams->stream(domain, instance);
  lua_pushinteger(state, stream.range(0, 1000));
  return 1;
}

int time_tick(lua_State* state) {
  const auto tick = context(state).logical_tick;
  if (tick > static_cast<std::uint64_t>(std::numeric_limits<lua_Integer>::max())) {
    return luaL_error(state, "SDK_TIMER_LOGICAL_TIME_REQUIRED: logical tick exceeds Lua integer range");
  }
  lua_pushinteger(state, static_cast<lua_Integer>(tick));
  return 1;
}

int fixed_multiply_binding(lua_State* state) {
  const auto left = luaL_checkinteger(state, 2);
  const auto right = luaL_checkinteger(state, 3);
  const auto scale = static_cast<std::uint8_t>(luaL_optinteger(state, 4, default_fixed_scale));
  lua_pushinteger(state, fixed_result_or_error(state, fixed_multiply(left, right, scale)));
  return 1;
}

int fixed_divide_binding(lua_State* state) {
  const auto left = luaL_checkinteger(state, 2);
  const auto right = luaL_checkinteger(state, 3);
  const auto scale = static_cast<std::uint8_t>(luaL_optinteger(state, 4, default_fixed_scale));
  lua_pushinteger(state, fixed_result_or_error(state, fixed_divide(left, right, scale)));
  return 1;
}

int fixed_rescale_binding(lua_State* state) {
  const auto value = luaL_checkinteger(state, 2);
  const auto from = static_cast<std::uint8_t>(luaL_checkinteger(state, 3));
  const auto to = static_cast<std::uint8_t>(luaL_checkinteger(state, 4));
  lua_pushinteger(state, fixed_result_or_error(state, fixed_rescale(value, from, to)));
  return 1;
}

void budget_hook(lua_State* state, lua_Debug*) {
  luaL_error(state, "gameplay instruction budget exceeded");
}

void set_context(lua_State* state, ExecutionContext* value) {
  lua_pushlightuserdata(state, const_cast<char*>(&execution_context_key));
  lua_pushlightuserdata(state, value);
  lua_settable(state, LUA_REGISTRYINDEX);
}

void push_context_table(lua_State* state) {
  lua_createtable(state, 0, 7);
  lua_createtable(state, 0, 3);
  lua_pushcfunction(state, query_get_i64);
  lua_setfield(state, -2, "get_i64");
  lua_pushcfunction(state, query_read);
  lua_setfield(state, -2, "read");
  lua_pushcfunction(state, query_cost);
  lua_setfield(state, -2, "cost");
  lua_setfield(state, -2, "query");
  lua_createtable(state, 0, 5);
  lua_pushcfunction(state, commands_add_i64);
  lua_setfield(state, -2, "add_i64");
  lua_pushcfunction(state, commands_add);
  lua_setfield(state, -2, "add");
  lua_pushcfunction(state, commands_play_audio);
  lua_setfield(state, -2, "play_audio");
  lua_pushcfunction(state, commands_stop_audio);
  lua_setfield(state, -2, "stop_audio");
  lua_pushcfunction(state, commands_spawn_effect);
  lua_setfield(state, -2, "spawn_effect");
  lua_setfield(state, -2, "commands");
  lua_createtable(state, 0, 1);
  lua_pushcfunction(state, world_set_delta);
  lua_setfield(state, -2, "set_delta");
  lua_setfield(state, -2, "world");
  lua_createtable(state, 0, 2);
  lua_pushcfunction(state, random_range);
  lua_setfield(state, -2, "range");
  lua_pushcfunction(state, random_unit_milli);
  lua_setfield(state, -2, "unit_milli");
  lua_setfield(state, -2, "random");
  lua_createtable(state, 0, 3);
  lua_pushcfunction(state, fixed_multiply_binding);
  lua_setfield(state, -2, "mul");
  lua_pushcfunction(state, fixed_divide_binding);
  lua_setfield(state, -2, "div");
  lua_pushcfunction(state, fixed_rescale_binding);
  lua_setfield(state, -2, "rescale");
  lua_setfield(state, -2, "fixed");
  lua_createtable(state, 0, 3);
  lua_pushcfunction(state, timers_start);
  lua_setfield(state, -2, "start");
  lua_pushcfunction(state, timers_cancel);
  lua_setfield(state, -2, "cancel");
  lua_pushcfunction(state, timers_remaining);
  lua_setfield(state, -2, "remaining");
  lua_setfield(state, -2, "timers");
  lua_createtable(state, 0, 1);
  lua_pushcfunction(state, time_tick);
  lua_setfield(state, -2, "tick");
  lua_setfield(state, -2, "time");
}

void push_sdk_table(lua_State* state) {
  lua_createtable(state, 0, 4);
  lua_pushinteger(state, static_cast<lua_Integer>(contract::lua_sdk_version));
  lua_setfield(state, -2, "sdkVersion");
  lua_createtable(state, 0, 2);
  lua_pushcfunction(state, sdk_bind_state);
  lua_setfield(state, -2, "state");
  lua_pushcfunction(state, sdk_bind_timer);
  lua_setfield(state, -2, "timer");
  lua_setfield(state, -2, "symbol");
  lua_createtable(state, 0, 1);
  lua_pushcfunction(state, sdk_query_declare);
  lua_setfield(state, -2, "declare");
  lua_setfield(state, -2, "query");
  lua_createtable(state, 0, 1);
  lua_pushcfunction(state, sdk_content_get);
  lua_setfield(state, -2, "get");
  lua_setfield(state, -2, "content");
}

void push_input_table(lua_State* state, const ScriptInput& input) {
  lua_createtable(state, 0, 2);
  lua_pushinteger(state, input.action_id);
  lua_setfield(state, -2, "action_id");
  lua_pushinteger(state, input.value_milli);
  lua_setfield(state, -2, "value_milli");
}

void push_timer_event_table(lua_State* state, const std::string_view timer_name) {
  lua_createtable(state, 0, 1);
  lua_pushlstring(state, timer_name.data(), timer_name.size());
  lua_setfield(state, -2, "timer");
}

void push_statechart_guard_event_table(
    lua_State* state,
    const std::string_view guard_name,
    const StatechartTransition& transition) {
  lua_createtable(state, 0, 4);
  lua_pushlstring(state, guard_name.data(), guard_name.size());
  lua_setfield(state, -2, "id");
  lua_pushinteger(state, transition.id);
  lua_setfield(state, -2, "transition_id");
  lua_pushinteger(state, transition.from);
  lua_setfield(state, -2, "from_state");
  lua_pushinteger(state, transition.to);
  lua_setfield(state, -2, "to_state");
}

const char* statechart_phase_name(const StatechartActionPhase phase) {
  switch (phase) {
    case StatechartActionPhase::exit: return "exit";
    case StatechartActionPhase::transition: return "transition";
    case StatechartActionPhase::entry: return "entry";
  }
  return "unknown";
}

void push_statechart_action_event_table(
    lua_State* state,
    const std::string_view action_name,
    const StatechartActionInvocation& invocation) {
  lua_createtable(state, 0, 5);
  lua_pushlstring(state, action_name.data(), action_name.size());
  lua_setfield(state, -2, "id");
  lua_pushstring(state, statechart_phase_name(invocation.phase));
  lua_setfield(state, -2, "phase");
  lua_pushinteger(state, invocation.transition);
  lua_setfield(state, -2, "transition_id");
  lua_pushinteger(state, invocation.previous);
  lua_setfield(state, -2, "previous_state");
  lua_pushinteger(state, invocation.active);
  lua_setfield(state, -2, "active_state");
}

void install_sdk_metatables(lua_State* state) {
  if (luaL_newmetatable(state, symbol_ref_metatable) != 0) {
    lua_pushboolean(state, 0);
    lua_setfield(state, -2, "__metatable");
  }
  lua_pop(state, 1);
  if (luaL_newmetatable(state, query_metatable) != 0) {
    lua_pushcfunction(state, [](lua_State* inner) {
      auto* query = static_cast<LuaQuery*>(luaL_checkudata(inner, 1, query_metatable));
      query->~LuaQuery();
      return 0;
    });
    lua_setfield(state, -2, "__gc");
    lua_pushboolean(state, 0);
    lua_setfield(state, -2, "__metatable");
  }
  lua_pop(state, 1);
}

void collect_public_surface(
    lua_State* state,
    const int table_index,
    const std::string& prefix,
    std::vector<std::string>& output) {
  const int table = lua_absindex(state, table_index);
  lua_pushnil(state);
  while (lua_next(state, table) != 0) {
    std::size_t length = 0;
    const char* field = luaL_checklstring(state, -2, &length);
    const std::string name = prefix + "." + std::string(field, length);
    if (lua_istable(state, -1)) {
      collect_public_surface(state, -1, name, output);
    } else {
      output.push_back(name);
    }
    lua_pop(state, 1);
  }
}

}  // namespace

LuaSandbox::LuaSandbox() : state_(luaL_newstate()) {
  if (state_ == nullptr) {
    throw std::bad_alloc();
  }
  luaL_requiref(state_, LUA_GNAME, luaopen_base, 1);
  lua_pop(state_, 1);
  luaL_requiref(state_, LUA_TABLIBNAME, luaopen_table, 1);
  lua_pop(state_, 1);
  luaL_requiref(state_, LUA_STRLIBNAME, luaopen_string, 1);
  lua_pop(state_, 1);
  luaL_requiref(state_, LUA_MATHLIBNAME, luaopen_math, 1);
  lua_pop(state_, 1);
  luaL_requiref(state_, LUA_UTF8LIBNAME, luaopen_utf8, 1);
  lua_pop(state_, 1);

  lua_getglobal(state_, "math");
  lua_pushnil(state_);
  lua_setfield(state_, -2, "random");
  lua_pushnil(state_);
  lua_setfield(state_, -2, "randomseed");
  lua_pop(state_, 1);
  for (const char* name : {"collectgarbage", "dofile", "load", "loadfile"}) {
    lua_pushnil(state_);
    lua_setglobal(state_, name);
  }
  install_sdk_metatables(state_);
}

LuaSandbox::~LuaSandbox() {
  if (state_ != nullptr) {
    lua_close(state_);
  }
}

bool LuaSandbox::load(const std::string_view source, const SymbolTables& symbols) {
  last_error_.clear();
  last_error_code_.clear();
  push_sdk_table(state_);
  lua_setglobal(state_, "SDK");
  if (luaL_loadbuffer(state_, source.data(), source.size(), "@gameplay.lua") != LUA_OK) {
    record_error(lua_tostring(state_, -1));
    lua_pop(state_, 1);
    return false;
  }
  ModuleLoadContext load_context{&symbols};
  set_module_load_context(state_, &load_context);
  lua_sethook(state_, budget_hook, LUA_MASKCOUNT, instruction_budget);
  const int load_result = lua_pcall(state_, 0, 1, 0);
  lua_sethook(state_, nullptr, 0, 0);
  set_module_load_context(state_, nullptr);
  if (load_result != LUA_OK) {
    record_error(lua_tostring(state_, -1));
    lua_pop(state_, 1);
    return false;
  }
  if (!lua_istable(state_, -1)) {
    record_error("gameplay module must return a table");
    lua_pop(state_, 1);
    return false;
  }
  lua_getfield(state_, -1, "on_input");
  const bool valid = lua_isfunction(state_, -1);
  lua_pop(state_, 1);
  if (!valid) {
    record_error("gameplay module must define on_input(ctx, event)");
    lua_pop(state_, 1);
    return false;
  }
  const int new_reference = luaL_ref(state_, LUA_REGISTRYINDEX);
  if (behavior_reference_ != LUA_NOREF) {
    luaL_unref(state_, LUA_REGISTRYINDEX, behavior_reference_);
  }
  behavior_reference_ = new_reference;
  return true;
}

bool LuaSandbox::on_input(
    const ScriptInput& input,
    const std::uint64_t logical_tick,
    const IntegerState& state,
    const SymbolTables& symbols,
    const LogicalTimerStore& timers,
    RandomStreamRegistry& random_streams,
    CommandBuffer& commands) {
  if (behavior_reference_ == LUA_NOREF) {
    return true;
  }
  ExecutionContext execution_context{logical_tick, &state, &symbols, &timers, &random_streams, &commands, true};
  set_context(state_, &execution_context);
  lua_rawgeti(state_, LUA_REGISTRYINDEX, behavior_reference_);
  lua_getfield(state_, -1, "on_input");
  lua_remove(state_, -2);
  push_context_table(state_);
  push_input_table(state_, input);
  lua_sethook(state_, budget_hook, LUA_MASKCOUNT, instruction_budget);
  const int result = lua_pcall(state_, 2, 0, 0);
  lua_sethook(state_, nullptr, 0, 0);
  set_context(state_, nullptr);
  if (result != LUA_OK) {
    record_error(lua_tostring(state_, -1));
    lua_pop(state_, 1);
    return false;
  }
  return true;
}

bool LuaSandbox::load_content_pack(const std::string_view bytes) {
  std::string error;
  if (!ContentPack::install(state_, bytes, error)) {
    record_error(std::move(error));
    return false;
  }
  return true;
}

bool LuaSandbox::on_timer(
    const std::string_view timer_name,
    const std::uint64_t logical_tick,
    const IntegerState& state,
    const SymbolTables& symbols,
    const LogicalTimerStore& timers,
    RandomStreamRegistry& random_streams,
    CommandBuffer& commands) {
  if (behavior_reference_ == LUA_NOREF) {
    return true;
  }
  ExecutionContext execution_context{logical_tick, &state, &symbols, &timers, &random_streams, &commands, true};
  set_context(state_, &execution_context);
  lua_rawgeti(state_, LUA_REGISTRYINDEX, behavior_reference_);
  lua_getfield(state_, -1, "on_timer");
  if (lua_isnil(state_, -1)) {
    // A module without on_timer simply ignores expirations.
    lua_pop(state_, 2);
    set_context(state_, nullptr);
    return true;
  }
  lua_remove(state_, -2);
  push_context_table(state_);
  push_timer_event_table(state_, timer_name);
  lua_sethook(state_, budget_hook, LUA_MASKCOUNT, instruction_budget);
  const int result = lua_pcall(state_, 2, 0, 0);
  lua_sethook(state_, nullptr, 0, 0);
  set_context(state_, nullptr);
  if (result != LUA_OK) {
    record_error(lua_tostring(state_, -1));
    lua_pop(state_, 1);
    return false;
  }
  return true;
}

bool LuaSandbox::statechart_guard(
    const std::string_view guard_name,
    const StatechartTransition& transition,
    const std::uint64_t logical_tick,
    const IntegerState& state,
    const SymbolTables& symbols,
    const LogicalTimerStore& timers,
    RandomStreamRegistry& random_streams,
    CommandBuffer& commands,
    bool& passed) {
  if (behavior_reference_ == LUA_NOREF) {
    record_error("STATECHART_GUARD_HANDLER_MISSING: gameplay is not loaded");
    return false;
  }
  ExecutionContext execution_context{logical_tick, &state, &symbols, &timers, &random_streams, &commands, false};
  set_context(state_, &execution_context);
  lua_rawgeti(state_, LUA_REGISTRYINDEX, behavior_reference_);
  lua_getfield(state_, -1, "on_statechart_guard");
  if (lua_isnil(state_, -1)) {
    lua_pop(state_, 2);
    set_context(state_, nullptr);
    record_error("STATECHART_GUARD_HANDLER_MISSING: gameplay module must define on_statechart_guard(ctx, event)");
    return false;
  }
  lua_remove(state_, -2);
  push_context_table(state_);
  push_statechart_guard_event_table(state_, guard_name, transition);
  lua_sethook(state_, budget_hook, LUA_MASKCOUNT, instruction_budget);
  const int result = lua_pcall(state_, 2, 1, 0);
  lua_sethook(state_, nullptr, 0, 0);
  set_context(state_, nullptr);
  if (result != LUA_OK) {
    record_error(lua_tostring(state_, -1));
    lua_pop(state_, 1);
    return false;
  }
  if (!lua_isboolean(state_, -1)) {
    lua_pop(state_, 1);
    record_error("STATECHART_GUARD_RESULT_INVALID: on_statechart_guard must return a boolean");
    return false;
  }
  passed = lua_toboolean(state_, -1) != 0;
  lua_pop(state_, 1);
  return true;
}

bool LuaSandbox::statechart_action(
    const std::string_view action_name,
    const StatechartActionInvocation& invocation,
    const std::uint64_t logical_tick,
    const IntegerState& state,
    const SymbolTables& symbols,
    const LogicalTimerStore& timers,
    RandomStreamRegistry& random_streams,
    CommandBuffer& commands) {
  if (behavior_reference_ == LUA_NOREF) {
    record_error("STATECHART_ACTION_HANDLER_MISSING: gameplay is not loaded");
    return false;
  }
  ExecutionContext execution_context{logical_tick, &state, &symbols, &timers, &random_streams, &commands, true};
  set_context(state_, &execution_context);
  lua_rawgeti(state_, LUA_REGISTRYINDEX, behavior_reference_);
  lua_getfield(state_, -1, "on_statechart_action");
  if (lua_isnil(state_, -1)) {
    lua_pop(state_, 2);
    set_context(state_, nullptr);
    record_error("STATECHART_ACTION_HANDLER_MISSING: gameplay module must define on_statechart_action(ctx, event)");
    return false;
  }
  lua_remove(state_, -2);
  push_context_table(state_);
  push_statechart_action_event_table(state_, action_name, invocation);
  lua_sethook(state_, budget_hook, LUA_MASKCOUNT, instruction_budget);
  const int result = lua_pcall(state_, 2, 0, 0);
  lua_sethook(state_, nullptr, 0, 0);
  set_context(state_, nullptr);
  if (result != LUA_OK) {
    record_error(lua_tostring(state_, -1));
    lua_pop(state_, 1);
    return false;
  }
  return true;
}

/**
 * Extracts a stable code from a script failure. Bindings raise errors shaped as
 * `CODE: detail`, so a caller can report `SDK_SYMBOL_UNKNOWN` instead of matching
 * on a message that changes with Lua's formatting.
 */
void LuaSandbox::record_error(std::string message) {
  last_error_code_.clear();
  // Lua prefixes `chunk:line: `; the code, when present, follows it.
  std::size_t start = 0;
  const auto prefix = message.rfind(": ", message.size());
  if (prefix != std::string::npos) {
    const auto candidate_start = message.rfind(' ', prefix);
    start = candidate_start == std::string::npos ? 0 : candidate_start + 1;
  }
  for (std::size_t index = start; index < message.size(); ++index) {
    const char character = message[index];
    if (character == ':') {
      const auto candidate = message.substr(start, index - start);
      const bool stable = !candidate.empty() &&
          candidate.find_first_not_of("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_") == std::string::npos;
      if (stable) last_error_code_ = candidate;
      break;
    }
    if (character == ' ') break;
  }
  last_error_ = std::move(message);
}

const std::string& LuaSandbox::last_error() const noexcept {
  return last_error_;
}

const std::string& LuaSandbox::last_error_code() const noexcept {
  return last_error_code_;
}

bool LuaSandbox::sdk_contract_boundary_valid() {
  LuaSandbox sandbox;
  std::vector<std::string> actual;
  push_sdk_table(sandbox.state_);
  collect_public_surface(sandbox.state_, -1, "SDK", actual);
  lua_pop(sandbox.state_, 1);
  push_context_table(sandbox.state_);
  collect_public_surface(sandbox.state_, -1, "ctx", actual);
  lua_pop(sandbox.state_, 1);
  push_input_table(sandbox.state_, {0, 0, 0});
  collect_public_surface(sandbox.state_, -1, "event", actual);
  lua_pop(sandbox.state_, 1);
  push_timer_event_table(sandbox.state_, "timer");
  collect_public_surface(sandbox.state_, -1, "event", actual);
  lua_pop(sandbox.state_, 1);

  std::vector<std::string> expected;
  expected.reserve(contract::lua_sdk_symbols.size());
  for (const auto& symbol : contract::lua_sdk_symbols) expected.emplace_back(symbol.name);
  std::sort(actual.begin(), actual.end());
  std::sort(expected.begin(), expected.end());
  return actual == expected;
}

}  // namespace ludivra::kernel
