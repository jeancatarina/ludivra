#include "lua_sandbox.hpp"

#include "fixed_point.hpp"

#include <cstring>
#include <limits>
#include <new>
#include <string_view>

extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

namespace ludivra::kernel {
namespace {

constexpr int instruction_budget = 100'000;
constexpr char execution_context_key = 0;

struct ExecutionContext final {
  const IntegerState* state;
  const SymbolTables* symbols;
  const LogicalTimerStore* timers;
  RandomStreamRegistry* random_streams;
  CommandBuffer* commands;
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
    context(state).commands->add_integer(key, delta);
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
    context(state).commands->play_audio(id, volume);
  } catch (...) {
    return luaL_error(state, "unable to allocate audio command");
  }
  return 0;
}

int commands_stop_audio(lua_State* state) {
  try {
    context(state).commands->stop_audio(checked_key(state, 2));
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
    context(state).commands->spawn_effect(id, intensity, x, y, z);
  } catch (...) {
    return luaL_error(state, "unable to allocate effect command");
  }
  return 0;
}

/// Resolves a declared symbol. An unknown name fails the tick with a stable
/// message instead of silently reading key zero.
std::uint32_t resolved_symbol(lua_State* state, const int index, const SymbolKind kind) {
  std::size_t length = 0;
  const char* text = luaL_checklstring(state, index, &length);
  const auto& symbols = context(state).symbols->of(kind);
  const auto found = symbols.find(std::string(text, length));
  if (found == symbols.end()) {
    luaL_error(state, "SDK_SYMBOL_UNKNOWN: %s", text);
  }
  return found->second;
}

int state_get(lua_State* state) {
  const auto key = resolved_symbol(state, 2, SymbolKind::state);
  const auto& values = *context(state).state;
  const auto found = values.find(key);
  lua_pushinteger(state, found == values.end() ? 0 : found->second);
  return 1;
}

int commands_add(lua_State* state) {
  const auto key = resolved_symbol(state, 2, SymbolKind::state);
  const auto value = luaL_checkinteger(state, 3);
  try {
    context(state).commands->add_integer(key, value);
  } catch (...) {
    return luaL_error(state, "unable to allocate state command");
  }
  return 0;
}

/// Starts or restarts a timer measured in logical ticks. Zero ticks is refused:
/// an immediate expiry is a call, not a timer.
int timers_start(lua_State* state) {
  const auto key = resolved_symbol(state, 2, SymbolKind::timer);
  const auto ticks = luaL_checkinteger(state, 3);
  if (ticks <= 0) {
    return luaL_argerror(state, 3, "timer ticks must be positive");
  }
  try {
    context(state).commands->start_timer(key, static_cast<std::uint64_t>(ticks));
  } catch (...) {
    return luaL_error(state, "unable to allocate timer command");
  }
  return 0;
}

int timers_cancel(lua_State* state) {
  const auto key = resolved_symbol(state, 2, SymbolKind::timer);
  try {
    context(state).commands->cancel_timer(key);
  } catch (...) {
    return luaL_error(state, "unable to allocate timer command");
  }
  return 0;
}

/// Remaining ticks, or nil when the timer is not running. Cancellation and expiry
/// are therefore observable from the script itself.
int timers_remaining(lua_State* state) {
  const auto key = resolved_symbol(state, 2, SymbolKind::timer);
  const auto remaining = context(state).timers->remaining(key);
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
  lua_createtable(state, 0, 2);
  lua_createtable(state, 0, 1);
  lua_pushcfunction(state, query_get_i64);
  lua_setfield(state, -2, "get_i64");
  lua_setfield(state, -2, "query");
  lua_createtable(state, 0, 1);
  lua_pushcfunction(state, state_get);
  lua_setfield(state, -2, "get");
  lua_setfield(state, -2, "state");
  lua_createtable(state, 0, 4);
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
}

void push_input_table(lua_State* state, const ScriptInput& input) {
  lua_createtable(state, 0, 2);
  lua_pushinteger(state, input.action_id);
  lua_setfield(state, -2, "action_id");
  lua_pushinteger(state, input.value_milli);
  lua_setfield(state, -2, "value_milli");
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
}

LuaSandbox::~LuaSandbox() {
  if (state_ != nullptr) {
    lua_close(state_);
  }
}

bool LuaSandbox::load(const std::string_view source) {
  last_error_.clear();
  if (luaL_loadbuffer(state_, source.data(), source.size(), "@gameplay.lua") != LUA_OK) {
    record_error(lua_tostring(state_, -1));
    lua_pop(state_, 1);
    return false;
  }
  lua_sethook(state_, budget_hook, LUA_MASKCOUNT, instruction_budget);
  const int load_result = lua_pcall(state_, 0, 1, 0);
  lua_sethook(state_, nullptr, 0, 0);
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
    const IntegerState& state,
    const SymbolTables& symbols,
    const LogicalTimerStore& timers,
    RandomStreamRegistry& random_streams,
    CommandBuffer& commands) {
  if (behavior_reference_ == LUA_NOREF) {
    return true;
  }
  ExecutionContext execution_context{&state, &symbols, &timers, &random_streams, &commands};
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

bool LuaSandbox::on_timer(
    const std::string_view timer_name,
    const IntegerState& state,
    const SymbolTables& symbols,
    const LogicalTimerStore& timers,
    RandomStreamRegistry& random_streams,
    CommandBuffer& commands) {
  if (behavior_reference_ == LUA_NOREF) {
    return true;
  }
  ExecutionContext execution_context{&state, &symbols, &timers, &random_streams, &commands};
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
  lua_createtable(state_, 0, 1);
  lua_pushlstring(state_, timer_name.data(), timer_name.size());
  lua_setfield(state_, -2, "timer");
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

}  // namespace ludivra::kernel
