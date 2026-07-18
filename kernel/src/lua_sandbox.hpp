#pragma once

#include "command_buffer.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>

struct lua_State;

namespace ludivra::kernel {

using IntegerState = std::unordered_map<std::uint32_t, std::int64_t>;

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
      CommandBuffer& commands);
  [[nodiscard]] const std::string& last_error() const noexcept;

 private:
  lua_State* state_{nullptr};
  int behavior_reference_{-2};
  std::string last_error_;
};

}  // namespace ludivra::kernel
