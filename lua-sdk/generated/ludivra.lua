-- Generated from contracts/lua-sdk-v1.json. Do not edit.
-- Lua language-server declarations for the public gameplay surface.

---@class LudivraSymbol
local LudivraSymbol = {}

---@class LudivraQuery
local LudivraQuery = {}

---@class LudivraSdkSymbol
---@field state fun(name: string): LudivraSymbol
---@field timer fun(name: string): LudivraSymbol

---@class LudivraSdkQuery
---@field declare fun(fields: table<string, LudivraSymbol>): LudivraQuery

---@class LudivraSdkContent
---@field get fun(id: string): table

---@class LudivraSdk
---@field sdkVersion integer
---@field symbol LudivraSdkSymbol
---@field query LudivraSdkQuery
---@field content LudivraSdkContent
SDK = SDK

---@class LudivraQueryContext
---@field read fun(self: LudivraQueryContext, query: LudivraQuery): table<string, integer>
---@field cost fun(self: LudivraQueryContext, query: LudivraQuery): integer
---@field get_i64 fun(self: LudivraQueryContext, key: integer): integer

---@class LudivraCommands
---@field add fun(self: LudivraCommands, symbol: LudivraSymbol, delta: integer)
---@field add_i64 fun(self: LudivraCommands, key: integer, delta: integer)
---@field play_audio fun(self: LudivraCommands, id: integer, volumeMilli: integer)
---@field stop_audio fun(self: LudivraCommands, id: integer)
---@field spawn_effect fun(self: LudivraCommands, id: integer, intensityMilli: integer, xMilli: integer, yMilli: integer, zMilli: integer)

---@class LudivraTimers
---@field start fun(self: LudivraTimers, timer: LudivraSymbol, ticks: integer)
---@field cancel fun(self: LudivraTimers, timer: LudivraSymbol)
---@field remaining fun(self: LudivraTimers, timer: LudivraSymbol): integer|nil

---@class LudivraRandom
---@field range fun(self: LudivraRandom, domain: string, minimum: integer, maximum: integer, instance: integer|nil): integer
---@field unit_milli fun(self: LudivraRandom, domain: string, instance: integer|nil): integer

---@class LudivraFixed
---@field mul fun(self: LudivraFixed, left: integer, right: integer, scale: integer|nil): integer
---@field div fun(self: LudivraFixed, left: integer, right: integer, scale: integer|nil): integer
---@field rescale fun(self: LudivraFixed, value: integer, fromScale: integer, toScale: integer): integer

---@class LudivraTime
---@field tick fun(self: LudivraTime): integer

---@class LudivraInputEvent
---@field action_id integer
---@field value_milli integer

---@class LudivraTimerEvent
---@field timer string

---@class LudivraContext
---@field query LudivraQueryContext
---@field commands LudivraCommands
---@field timers LudivraTimers
---@field random LudivraRandom
---@field fixed LudivraFixed
---@field time LudivraTime
