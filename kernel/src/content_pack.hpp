#pragma once

#include <string>
#include <string_view>

struct lua_State;

namespace ludivra::kernel {

/**
 * Reader for the content pack produced by the authoring compiler.
 *
 * It accepts only the canonical JSON that compiler emits — no comments, no
 * trailing commas, no duplicate keys — because the pack is a derived artifact of
 * this project, not arbitrary input. Anything else is refused with a code instead
 * of being interpreted generously.
 */
class ContentPack final {
 public:
  /**
   * Parses the pack and installs its documents as a read-only `CONTENT` global.
   * Gameplay then reads content the same way at load time and during a tick,
   * without the data ever travelling inside the script chunk.
   */
  [[nodiscard]] static bool install(lua_State* state, std::string_view bytes, std::string& error);
};

}  // namespace ludivra::kernel
