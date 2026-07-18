#include "lua_sandbox.hpp"

#include <limits>
#include <new>

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
  CommandBuffer* commands;
};

std::uint32_t checked_key(lua_State* state, const int index) {
  const auto key = luaL_checkinteger(state, index);
  if (key < 0 || static_cast<lua_Unsigned>(key) > std::numeric_limits<std::uint32_t>::max()) {
    luaL_argerror(state, index, "state key must be an unsigned 32-bit integer");
  }
  return static_cast<std::uint32_t>(key);
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
  lua_pushcfunction(state, commands_add_i64);
  lua_setfield(state, -2, "add_i64");
  lua_setfield(state, -2, "commands");
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
    last_error_ = lua_tostring(state_, -1);
    lua_pop(state_, 1);
    return false;
  }
  lua_sethook(state_, budget_hook, LUA_MASKCOUNT, instruction_budget);
  const int load_result = lua_pcall(state_, 0, 1, 0);
  lua_sethook(state_, nullptr, 0, 0);
  if (load_result != LUA_OK) {
    last_error_ = lua_tostring(state_, -1);
    lua_pop(state_, 1);
    return false;
  }
  if (!lua_istable(state_, -1)) {
    last_error_ = "gameplay module must return a table";
    lua_pop(state_, 1);
    return false;
  }
  lua_getfield(state_, -1, "on_input");
  const bool valid = lua_isfunction(state_, -1);
  lua_pop(state_, 1);
  if (!valid) {
    last_error_ = "gameplay module must define on_input(ctx, event)";
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
    CommandBuffer& commands) {
  if (behavior_reference_ == LUA_NOREF) {
    return true;
  }
  ExecutionContext execution_context{&state, &commands};
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
    last_error_ = lua_tostring(state_, -1);
    lua_pop(state_, 1);
    return false;
  }
  return true;
}

const std::string& LuaSandbox::last_error() const noexcept {
  return last_error_;
}

}  // namespace ludivra::kernel
