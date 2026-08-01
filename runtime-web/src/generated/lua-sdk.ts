// Generated from contracts/lua-sdk-v1.json. Do not edit.

export const LUA_SDK_VERSION = 1 as const;
export const LUA_SDK_MAXIMUM_QUERY_FIELDS = 64 as const;
export const LUA_SDK_QUERY_COST_UNIT = "state_reads" as const;
export const LUA_SDK_QUERY_COST_FORMULA = "fieldCount" as const;
export type LuaSdkMaturity = "experimental" | "stable" | "deprecated";
export interface LuaSdkSymbol { name: string; layer: 0 | 1; maturity: LuaSdkMaturity; consumer: string; migration?: string; removalCondition?: string; }
export const LUA_SDK_SYMBOLS: readonly LuaSdkSymbol[] = [
  {
    "name": "ctx.commands.add",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "examples/card-roguelite/scripts/gameplay.lua"
  },
  {
    "name": "ctx.commands.add_i64",
    "layer": 0,
    "maturity": "deprecated",
    "consumer": "tests/fixtures/counter.lua",
    "migration": "Use SDK.symbol.state plus ctx.commands:add.",
    "removalCondition": "Remove after the native boundary fixture no longer needs a raw-key command."
  },
  {
    "name": "ctx.commands.play_audio",
    "layer": 0,
    "maturity": "experimental",
    "consumer": "examples/first-game/scripts/gameplay.lua"
  },
  {
    "name": "ctx.commands.spawn_effect",
    "layer": 0,
    "maturity": "experimental",
    "consumer": "examples/first-game/scripts/gameplay.lua"
  },
  {
    "name": "ctx.commands.stop_audio",
    "layer": 0,
    "maturity": "experimental",
    "consumer": "tests/fixtures/feedback.lua"
  },
  {
    "name": "ctx.fixed.div",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/determinism.lua"
  },
  {
    "name": "ctx.fixed.mul",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/determinism.lua"
  },
  {
    "name": "ctx.fixed.rescale",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/determinism.lua"
  },
  {
    "name": "ctx.query.cost",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/symbols.lua"
  },
  {
    "name": "ctx.query.get_i64",
    "layer": 0,
    "maturity": "deprecated",
    "consumer": "tests/fixtures/counter.lua",
    "migration": "Use SDK.symbol.state, SDK.query.declare and ctx.query:read.",
    "removalCondition": "Remove after the native boundary fixture no longer needs a raw-key query."
  },
  {
    "name": "ctx.query.read",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "examples/first-game/scripts/gameplay.lua"
  },
  {
    "name": "ctx.random.range",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/determinism.lua"
  },
  {
    "name": "ctx.random.unit_milli",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/determinism.lua"
  },
  {
    "name": "ctx.time.tick",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/time.lua"
  },
  {
    "name": "ctx.timers.cancel",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/timers.lua"
  },
  {
    "name": "ctx.timers.remaining",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/timers.lua"
  },
  {
    "name": "ctx.timers.start",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/timers.lua"
  },
  {
    "name": "event.action_id",
    "layer": 0,
    "maturity": "experimental",
    "consumer": "examples/first-game/scripts/gameplay.lua"
  },
  {
    "name": "event.timer",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/timers.lua"
  },
  {
    "name": "event.value_milli",
    "layer": 0,
    "maturity": "experimental",
    "consumer": "examples/first-game/scripts/gameplay.lua"
  },
  {
    "name": "SDK.content.get",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "examples/card-roguelite/scripts/gameplay.lua"
  },
  {
    "name": "SDK.query.declare",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "examples/first-game/scripts/gameplay.lua"
  },
  {
    "name": "SDK.sdkVersion",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/runtime/runtime_test.cpp"
  },
  {
    "name": "SDK.symbol.state",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "examples/first-game/scripts/gameplay.lua"
  },
  {
    "name": "SDK.symbol.timer",
    "layer": 1,
    "maturity": "experimental",
    "consumer": "tests/fixtures/timers.lua"
  }
] as const;
