// Generated from contracts/lua-sdk-v1.json. Do not edit.
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace ludivra::kernel::contract {

enum class LuaSdkMaturity : std::uint8_t { experimental, stable, deprecated };

struct LuaSdkSymbol final {
  std::string_view name;
  std::uint8_t layer;
  LuaSdkMaturity maturity;
  std::string_view consumer;
};

inline constexpr std::uint32_t lua_sdk_version = 1U;
inline constexpr std::size_t lua_sdk_maximum_query_fields = 64U;
inline constexpr std::string_view lua_sdk_query_cost_unit = "state_reads";
inline constexpr std::string_view lua_sdk_query_cost_formula = "fieldCount";
inline constexpr std::array<LuaSdkSymbol, 26> lua_sdk_symbols{{
    {"ctx.commands.add", 1U, LuaSdkMaturity::experimental, "examples/card-roguelite/scripts/gameplay.lua"},
    {"ctx.commands.add_i64", 0U, LuaSdkMaturity::deprecated, "tests/fixtures/counter.lua"},
    {"ctx.commands.play_audio", 0U, LuaSdkMaturity::experimental, "examples/first-game/scripts/gameplay.lua"},
    {"ctx.commands.spawn_effect", 0U, LuaSdkMaturity::experimental, "examples/first-game/scripts/gameplay.lua"},
    {"ctx.commands.stop_audio", 0U, LuaSdkMaturity::experimental, "tests/fixtures/feedback.lua"},
    {"ctx.fixed.div", 1U, LuaSdkMaturity::experimental, "tests/fixtures/determinism.lua"},
    {"ctx.fixed.mul", 1U, LuaSdkMaturity::experimental, "tests/fixtures/determinism.lua"},
    {"ctx.fixed.rescale", 1U, LuaSdkMaturity::experimental, "tests/fixtures/determinism.lua"},
    {"ctx.query.cost", 1U, LuaSdkMaturity::experimental, "tests/fixtures/symbols.lua"},
    {"ctx.query.get_i64", 0U, LuaSdkMaturity::deprecated, "tests/fixtures/counter.lua"},
    {"ctx.query.read", 1U, LuaSdkMaturity::experimental, "examples/first-game/scripts/gameplay.lua"},
    {"ctx.random.range", 1U, LuaSdkMaturity::experimental, "tests/fixtures/determinism.lua"},
    {"ctx.random.unit_milli", 1U, LuaSdkMaturity::experimental, "tests/fixtures/determinism.lua"},
    {"ctx.time.tick", 1U, LuaSdkMaturity::experimental, "tests/fixtures/time.lua"},
    {"ctx.timers.cancel", 1U, LuaSdkMaturity::experimental, "tests/fixtures/timers.lua"},
    {"ctx.timers.remaining", 1U, LuaSdkMaturity::experimental, "tests/fixtures/timers.lua"},
    {"ctx.timers.start", 1U, LuaSdkMaturity::experimental, "tests/fixtures/timers.lua"},
    {"ctx.world.set_delta", 1U, LuaSdkMaturity::experimental, "tests/fixtures/region-storage.lua"},
    {"event.action_id", 0U, LuaSdkMaturity::experimental, "examples/first-game/scripts/gameplay.lua"},
    {"event.timer", 1U, LuaSdkMaturity::experimental, "tests/fixtures/timers.lua"},
    {"event.value_milli", 0U, LuaSdkMaturity::experimental, "examples/first-game/scripts/gameplay.lua"},
    {"SDK.content.get", 1U, LuaSdkMaturity::experimental, "examples/card-roguelite/scripts/gameplay.lua"},
    {"SDK.query.declare", 1U, LuaSdkMaturity::experimental, "examples/first-game/scripts/gameplay.lua"},
    {"SDK.sdkVersion", 1U, LuaSdkMaturity::experimental, "tests/runtime/runtime_test.cpp"},
    {"SDK.symbol.state", 1U, LuaSdkMaturity::experimental, "examples/first-game/scripts/gameplay.lua"},
    {"SDK.symbol.timer", 1U, LuaSdkMaturity::experimental, "tests/fixtures/timers.lua"}
}};

}  // namespace ludivra::kernel::contract
