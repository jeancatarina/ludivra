import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(root, "contracts/lua-sdk-v1.json");
const cppPath = resolve(root, "kernel/src/generated/lua_sdk_contract.hpp");
const tsPath = resolve(root, "runtime-web/src/generated/lua-sdk.ts");
const luaPath = resolve(root, "lua-sdk/generated/ludivra.lua");
const contract = JSON.parse(await readFile(sourcePath, "utf8"));

const fail = (message) => { throw new Error(`LUA_SDK_CONTRACT_UNSUPPORTED: ${message}`); };
const version = contract.sdkVersion;
const maximumFields = contract.queries?.maximumFields;
const costUnit = contract.queries?.costUnit;
const costFormula = contract.queries?.costFormula;
const symbols = contract.symbols;
if (!Number.isInteger(version) || version < 1 || !Number.isInteger(maximumFields) || maximumFields < 1 ||
    typeof costUnit !== "string" || typeof costFormula !== "string" || !Array.isArray(symbols) || symbols.length === 0) {
  fail("missing version, query limits or symbols");
}

const names = new Set();
for (const symbol of symbols) {
  if (typeof symbol?.name !== "string" || !/^(SDK|ctx|event)\.[A-Za-z0-9_.]+$/.test(symbol.name)) fail("invalid symbol name");
  if (names.has(symbol.name)) fail(`duplicate symbol ${symbol.name}`);
  names.add(symbol.name);
  if (!Number.isInteger(symbol.layer) || (symbol.layer !== 0 && symbol.layer !== 1)) fail(`invalid layer for ${symbol.name}`);
  if (!["experimental", "stable", "deprecated"].includes(symbol.maturity)) fail(`invalid maturity for ${symbol.name}`);
  if (typeof symbol.consumer !== "string" || symbol.consumer.length === 0) fail(`missing consumer for ${symbol.name}`);
  if (symbol.maturity === "deprecated" &&
      (typeof symbol.migration !== "string" || typeof symbol.removalCondition !== "string")) {
    fail(`deprecated symbol ${symbol.name} requires migration and removalCondition`);
  }
}
const ordered = [...symbols].sort((left, right) => left.name.localeCompare(right.name));
const quote = (value) => JSON.stringify(value);
const cpp = `// Generated from contracts/lua-sdk-v1.json. Do not edit.\n#pragma once\n\n#include <array>\n#include <cstddef>\n#include <cstdint>\n#include <string_view>\n\nnamespace ludivra::kernel::contract {\n\nenum class LuaSdkMaturity : std::uint8_t { experimental, stable, deprecated };\n\nstruct LuaSdkSymbol final {\n  std::string_view name;\n  std::uint8_t layer;\n  LuaSdkMaturity maturity;\n  std::string_view consumer;\n};\n\ninline constexpr std::uint32_t lua_sdk_version = ${version}U;\ninline constexpr std::size_t lua_sdk_maximum_query_fields = ${maximumFields}U;\ninline constexpr std::string_view lua_sdk_query_cost_unit = ${quote(costUnit)};\ninline constexpr std::string_view lua_sdk_query_cost_formula = ${quote(costFormula)};\ninline constexpr std::array<LuaSdkSymbol, ${ordered.length}> lua_sdk_symbols{{\n${ordered.map((symbol) => `    {${quote(symbol.name)}, ${symbol.layer}U, LuaSdkMaturity::${symbol.maturity}, ${quote(symbol.consumer)}}`).join(",\n")}\n}};\n\n}  // namespace ludivra::kernel::contract\n`;
const ts = `// Generated from contracts/lua-sdk-v1.json. Do not edit.\n\nexport const LUA_SDK_VERSION = ${version} as const;\nexport const LUA_SDK_MAXIMUM_QUERY_FIELDS = ${maximumFields} as const;\nexport const LUA_SDK_QUERY_COST_UNIT = ${quote(costUnit)} as const;\nexport const LUA_SDK_QUERY_COST_FORMULA = ${quote(costFormula)} as const;\nexport type LuaSdkMaturity = "experimental" | "stable" | "deprecated";\nexport interface LuaSdkSymbol { name: string; layer: 0 | 1; maturity: LuaSdkMaturity; consumer: string; migration?: string; removalCondition?: string; }\nexport const LUA_SDK_SYMBOLS: readonly LuaSdkSymbol[] = ${JSON.stringify(ordered, null, 2)} as const;\n`;
const lua = `-- Generated from contracts/lua-sdk-v1.json. Do not edit.\n-- Lua language-server declarations for the public gameplay surface.\n\n---@class LudivraSymbol\nlocal LudivraSymbol = {}\n\n---@class LudivraQuery\nlocal LudivraQuery = {}\n\n---@class LudivraSdkSymbol\n---@field state fun(name: string): LudivraSymbol\n---@field timer fun(name: string): LudivraSymbol\n\n---@class LudivraSdkQuery\n---@field declare fun(fields: table<string, LudivraSymbol>): LudivraQuery\n\n---@class LudivraSdkContent\n---@field get fun(id: string): table\n\n---@class LudivraSdk\n---@field sdkVersion integer\n---@field symbol LudivraSdkSymbol\n---@field query LudivraSdkQuery\n---@field content LudivraSdkContent\nSDK = SDK\n\n---@class LudivraQueryContext\n---@field read fun(self: LudivraQueryContext, query: LudivraQuery): table<string, integer>\n---@field cost fun(self: LudivraQueryContext, query: LudivraQuery): integer\n---@field get_i64 fun(self: LudivraQueryContext, key: integer): integer\n\n---@class LudivraCommands\n---@field add fun(self: LudivraCommands, symbol: LudivraSymbol, delta: integer)\n---@field add_i64 fun(self: LudivraCommands, key: integer, delta: integer)\n---@field play_audio fun(self: LudivraCommands, id: integer, volumeMilli: integer)\n---@field stop_audio fun(self: LudivraCommands, id: integer)\n---@field spawn_effect fun(self: LudivraCommands, id: integer, intensityMilli: integer, xMilli: integer, yMilli: integer, zMilli: integer)\n\n---@class LudivraTimers\n---@field start fun(self: LudivraTimers, timer: LudivraSymbol, ticks: integer)\n---@field cancel fun(self: LudivraTimers, timer: LudivraSymbol)\n---@field remaining fun(self: LudivraTimers, timer: LudivraSymbol): integer|nil\n\n---@class LudivraRandom\n---@field range fun(self: LudivraRandom, domain: string, minimum: integer, maximum: integer, instance: integer|nil): integer\n---@field unit_milli fun(self: LudivraRandom, domain: string, instance: integer|nil): integer\n\n---@class LudivraFixed\n---@field mul fun(self: LudivraFixed, left: integer, right: integer, scale: integer|nil): integer\n---@field div fun(self: LudivraFixed, left: integer, right: integer, scale: integer|nil): integer\n---@field rescale fun(self: LudivraFixed, value: integer, fromScale: integer, toScale: integer): integer\n\n---@class LudivraTime\n---@field tick fun(self: LudivraTime): integer\n\n---@class LudivraInputEvent\n---@field action_id integer\n---@field value_milli integer\n\n---@class LudivraTimerEvent\n---@field timer string\n\n---@class LudivraContext\n---@field query LudivraQueryContext\n---@field commands LudivraCommands\n---@field timers LudivraTimers\n---@field random LudivraRandom\n---@field fixed LudivraFixed\n---@field time LudivraTime\n`;

await Promise.all([mkdir(resolve(cppPath, ".."), { recursive: true }), mkdir(resolve(tsPath, ".."), { recursive: true }), mkdir(resolve(luaPath, ".."), { recursive: true })]);
const outputs = [[cppPath, cpp], [tsPath, ts], [luaPath, lua]];
if (process.argv.includes("--check")) {
  for (const [path, output] of outputs) {
    if (await readFile(path, "utf8").catch(() => "") !== output) {
      throw new Error("LUA_SDK_BINDINGS_STALE: run pnpm contracts");
    }
  }
} else {
  await Promise.all(outputs.map(([path, output]) => writeFile(path, output, "utf8")));
}
