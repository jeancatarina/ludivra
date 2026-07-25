#pragma once

#include "command_buffer.hpp"
#include "random_streams.hpp"
#include "state_archive.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>

struct lua_State;

namespace ludivra::kernel {

/// Semantic name to authoritative key. Built once when the host declares the
/// manifest, then read by name: gameplay never repeats a numeric key.
using StateSymbolTable = std::unordered_map<std::string, std::uint32_t>;

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
      const StateSymbolTable& symbols,
      RandomStreamRegistry& random_streams,
      CommandBuffer& commands);
  [[nodiscard]] const std::string& last_error() const noexcept;

 private:
  lua_State* state_{nullptr};
  int behavior_reference_{-2};
  std::string last_error_;
};

}  // namespace ludivra::kernel
