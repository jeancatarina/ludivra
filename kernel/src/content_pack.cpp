#include "content_pack.hpp"

#include <cstdlib>
#include <string>

extern "C" {
#include <lauxlib.h>
#include <lua.h>
}

namespace ludivra::kernel {
namespace {

constexpr int maximum_depth = 32;
constexpr char content_pack_registry_key = 0;

/// Cursor over the pack bytes. Every read is bounded; running past the end is a
/// parse failure, never undefined behaviour.
struct Cursor final {
  std::string_view text;
  std::size_t position{0};
  std::string error;

  [[nodiscard]] bool done() const noexcept { return position >= text.size(); }
  [[nodiscard]] char peek() const noexcept { return done() ? '\0' : text[position]; }

  bool expect(const char character) {
    if (peek() != character) {
      fail("CONTENT_PACK_FORMAT_UNSUPPORTED");
      return false;
    }
    position += 1;
    return true;
  }

  void fail(const char* code) {
    if (error.empty()) error = code;
  }
};

bool parse_value(lua_State* state, Cursor& cursor, int depth);

bool parse_string(Cursor& cursor, std::string& out) {
  if (!cursor.expect('"')) return false;
  out.clear();
  while (!cursor.done()) {
    const char character = cursor.text[cursor.position++];
    if (character == '"') return true;
    if (character != '\\') {
      out.push_back(character);
      continue;
    }
    if (cursor.done()) break;
    const char escaped = cursor.text[cursor.position++];
    switch (escaped) {
      case '"': out.push_back('"'); break;
      case '\\': out.push_back('\\'); break;
      case '/': out.push_back('/'); break;
      case 'b': out.push_back('\b'); break;
      case 'f': out.push_back('\f'); break;
      case 'n': out.push_back('\n'); break;
      case 'r': out.push_back('\r'); break;
      case 't': out.push_back('\t'); break;
      case 'u': {
        if (cursor.position + 4 > cursor.text.size()) {
          cursor.fail("CONTENT_PACK_FORMAT_UNSUPPORTED");
          return false;
        }
        const std::string digits(cursor.text.substr(cursor.position, 4));
        cursor.position += 4;
        const auto code = static_cast<unsigned long>(std::strtoul(digits.c_str(), nullptr, 16));
        // UTF-8 encoding of the basic plane; surrogate pairs are not emitted by the
        // canonical writer, so they are refused instead of guessed.
        if (code < 0x80U) {
          out.push_back(static_cast<char>(code));
        } else if (code < 0x800U) {
          out.push_back(static_cast<char>(0xC0U | (code >> 6U)));
          out.push_back(static_cast<char>(0x80U | (code & 0x3FU)));
        } else if (code >= 0xD800U && code <= 0xDFFFU) {
          cursor.fail("CONTENT_PACK_FORMAT_UNSUPPORTED");
          return false;
        } else {
          out.push_back(static_cast<char>(0xE0U | (code >> 12U)));
          out.push_back(static_cast<char>(0x80U | ((code >> 6U) & 0x3FU)));
          out.push_back(static_cast<char>(0x80U | (code & 0x3FU)));
        }
        break;
      }
      default:
        cursor.fail("CONTENT_PACK_FORMAT_UNSUPPORTED");
        return false;
    }
  }
  cursor.fail("CONTENT_PACK_FORMAT_UNSUPPORTED");
  return false;
}

bool parse_number(lua_State* state, Cursor& cursor) {
  const auto start = cursor.position;
  if (cursor.peek() == '-') cursor.position += 1;
  bool digits = false;
  bool fractional = false;
  while (!cursor.done()) {
    const char character = cursor.peek();
    if (character >= '0' && character <= '9') {
      digits = true;
    } else if (character == '.' || character == 'e' || character == 'E' || character == '+' || character == '-') {
      fractional = fractional || character == '.' || character == 'e' || character == 'E';
    } else {
      break;
    }
    cursor.position += 1;
  }
  if (!digits) {
    cursor.fail("CONTENT_PACK_FORMAT_UNSUPPORTED");
    return false;
  }
  const std::string literal(cursor.text.substr(start, cursor.position - start));
  if (fractional) {
    lua_pushnumber(state, std::strtod(literal.c_str(), nullptr));
  } else {
    // Whole values stay integers so gameplay keeps working in the authoritative
    // integer domain instead of silently receiving a float.
    lua_pushinteger(state, static_cast<lua_Integer>(std::strtoll(literal.c_str(), nullptr, 10)));
  }
  return true;
}

bool parse_literal(lua_State* state, Cursor& cursor) {
  const auto remaining = cursor.text.substr(cursor.position);
  if (remaining.rfind("true", 0) == 0) {
    cursor.position += 4;
    lua_pushboolean(state, 1);
    return true;
  }
  if (remaining.rfind("false", 0) == 0) {
    cursor.position += 5;
    lua_pushboolean(state, 0);
    return true;
  }
  if (remaining.rfind("null", 0) == 0) {
    // Lua has no null in a table: an absent value is absent, which is why the
    // canonical writer never emits one for content.
    cursor.fail("CONTENT_PACK_VALUE_UNSUPPORTED");
    return false;
  }
  cursor.fail("CONTENT_PACK_FORMAT_UNSUPPORTED");
  return false;
}

bool parse_array(lua_State* state, Cursor& cursor, const int depth) {
  if (!cursor.expect('[')) return false;
  lua_newtable(state);
  if (cursor.peek() == ']') {
    cursor.position += 1;
    return true;
  }
  lua_Integer index = 1;
  for (;;) {
    if (!parse_value(state, cursor, depth + 1)) return false;
    lua_rawseti(state, -2, index++);
    if (cursor.peek() == ',') {
      cursor.position += 1;
      continue;
    }
    return cursor.expect(']');
  }
}

bool parse_object(lua_State* state, Cursor& cursor, const int depth) {
  if (!cursor.expect('{')) return false;
  lua_newtable(state);
  if (cursor.peek() == '}') {
    cursor.position += 1;
    return true;
  }
  for (;;) {
    std::string key;
    if (!parse_string(cursor, key)) return false;
    if (!cursor.expect(':')) return false;
    lua_pushlstring(state, key.data(), key.size());
    if (!parse_value(state, cursor, depth + 1)) return false;
    lua_rawset(state, -3);
    if (cursor.peek() == ',') {
      cursor.position += 1;
      continue;
    }
    return cursor.expect('}');
  }
}

bool parse_value(lua_State* state, Cursor& cursor, const int depth) {
  if (depth > maximum_depth) {
    cursor.fail("CONTENT_PACK_TOO_DEEP");
    return false;
  }
  switch (cursor.peek()) {
    case '{': return parse_object(state, cursor, depth);
    case '[': return parse_array(state, cursor, depth);
    case '"': {
      std::string value;
      if (!parse_string(cursor, value)) return false;
      lua_pushlstring(state, value.data(), value.size());
      return true;
    }
    case 't':
    case 'f':
    case 'n':
      return parse_literal(state, cursor);
    default:
      return parse_number(state, cursor);
  }
}

/**
 * Wraps a table so content is readable but never mutable. A script that could
 * write to content would be holding hidden state outside save and replay.
 *
 * `__len` and `__pairs` are not optional: without them `#content.rooms` reads zero
 * and `pairs` sees nothing, because the proxy itself is empty.
 */
void wrap_read_only(lua_State* state) {
  lua_newtable(state);                       // proxy
  lua_newtable(state);                       // metatable
  lua_pushvalue(state, -3);                  // the real table
  lua_setfield(state, -2, "__index");

  lua_pushvalue(state, -3);
  lua_pushcclosure(state, [](lua_State* inner) {
    lua_pushinteger(inner, static_cast<lua_Integer>(luaL_len(inner, lua_upvalueindex(1))));
    return 1;
  }, 1);
  lua_setfield(state, -2, "__len");

  lua_pushvalue(state, -3);
  lua_pushcclosure(state, [](lua_State* inner) {
    lua_pushcfunction(inner, [](lua_State* iterator) {
      lua_settop(iterator, 2);
      return lua_next(iterator, 1) != 0 ? 2 : 1;
    });
    lua_pushvalue(inner, lua_upvalueindex(1));
    lua_pushnil(inner);
    return 3;
  }, 1);
  lua_setfield(state, -2, "__pairs");

  lua_pushcfunction(state, [](lua_State* inner) {
    return luaL_error(inner, "SDK_CONTENT_READ_ONLY: content is immutable");
  });
  lua_setfield(state, -2, "__newindex");
  lua_pushboolean(state, 0);
  lua_setfield(state, -2, "__metatable");
  lua_setmetatable(state, -2);
  lua_remove(state, -2);                     // drop the real table
}

/// Applies the read-only wrapper to every nested table, depth first.
void wrap_recursive(lua_State* state, const int depth) {
  if (depth > maximum_depth || lua_type(state, -1) != LUA_TTABLE) return;
  lua_pushnil(state);
  while (lua_next(state, -2) != 0) {
    if (lua_type(state, -1) == LUA_TTABLE) {
      wrap_recursive(state, depth + 1);
      wrap_read_only(state);
      lua_pushvalue(state, -2);   // key
      lua_insert(state, -2);      // key, wrapped value
      lua_rawset(state, -4);
      continue;
    }
    lua_pop(state, 1);
  }
}

}  // namespace

bool ContentPack::install(lua_State* state, const std::string_view bytes, std::string& error) {
  Cursor cursor{bytes, 0, {}};
  const int base = lua_gettop(state);
  if (!parse_value(state, cursor, 0) || !cursor.error.empty()) {
    error = cursor.error.empty() ? "CONTENT_PACK_FORMAT_UNSUPPORTED" : cursor.error;
    lua_settop(state, base);
    return false;
  }
  if (cursor.position != bytes.size()) {
    error = "CONTENT_PACK_FORMAT_UNSUPPORTED";
    lua_settop(state, base);
    return false;
  }
  if (lua_type(state, -1) != LUA_TTABLE) {
    error = "CONTENT_PACK_FORMAT_UNSUPPORTED";
    lua_settop(state, base);
    return false;
  }

  // Only the documents section reaches gameplay; symbols, origin and strings are
  // authoring evidence, consumed by tools rather than by the game.
  lua_getfield(state, -1, "sections");
  if (lua_type(state, -1) != LUA_TTABLE) {
    error = "CONTENT_PACK_FORMAT_UNSUPPORTED";
    lua_settop(state, base);
    return false;
  }
  lua_getfield(state, -1, "documents");
  if (lua_type(state, -1) != LUA_TTABLE) {
    error = "CONTENT_PACK_FORMAT_UNSUPPORTED";
    lua_settop(state, base);
    return false;
  }
  lua_getfield(state, -1, "value");
  if (lua_type(state, -1) != LUA_TTABLE) {
    error = "CONTENT_PACK_FORMAT_UNSUPPORTED";
    lua_settop(state, base);
    return false;
  }

  wrap_recursive(state, 0);
  wrap_read_only(state);
  lua_pushlightuserdata(state, const_cast<char*>(&content_pack_registry_key));
  lua_pushvalue(state, -2);
  lua_settable(state, LUA_REGISTRYINDEX);
  lua_pop(state, 1);
  lua_settop(state, base);
  return true;
}

bool ContentPack::push_document(lua_State* state, const std::string_view id, std::string& error) {
  const int base = lua_gettop(state);
  lua_pushlightuserdata(state, const_cast<char*>(&content_pack_registry_key));
  lua_gettable(state, LUA_REGISTRYINDEX);
  if (lua_type(state, -1) != LUA_TTABLE) {
    error = "SDK_CONTENT_NOT_LOADED";
    lua_settop(state, base);
    return false;
  }
  lua_pushlstring(state, id.data(), id.size());
  lua_gettable(state, -2);
  if (lua_isnil(state, -1)) {
    error = "SDK_CONTENT_UNKNOWN";
    lua_settop(state, base);
    return false;
  }
  lua_remove(state, -2);
  return true;
}

}  // namespace ludivra::kernel
