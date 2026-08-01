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
  static constexpr int format_version = 2;

  /**
 * Parses the pack and stores its documents in the Lua registry. The public SDK
 * reaches a document only through `SDK.content.get(id)`, so the backing table
 * never becomes an accidental global API.
   */
  [[nodiscard]] static bool install(lua_State* state, std::string_view bytes, std::string& error);
  /// Leaves the requested read-only document on the Lua stack. False leaves the
  /// stack unchanged and returns a stable diagnostic code in `error`.
  [[nodiscard]] static bool push_document(lua_State* state, std::string_view id, std::string& error);
};

}  // namespace ludivra::kernel
