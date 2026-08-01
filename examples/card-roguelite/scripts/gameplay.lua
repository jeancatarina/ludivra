local GAME = SDK.content.get("ludivra.game")
local RUN = SDK.content.get("ember-vault.run")
local P = RUN.phases

local Q = {}
local function declared_state(name)
  local symbol = SDK.symbol.state(name)
  Q[symbol] = SDK.query.declare({ value = symbol })
  return symbol
end

local S = {
  phase = declared_state("phase"),
  player_health = declared_state("player.health"),
  enemy_health = declared_state("enemy.health"),
  energy = declared_state("energy"),
  block = declared_state("block"),
  turn = declared_state("turn"),
  room = declared_state("room"),
  cards_played = declared_state("cards.played"),
  card_last = declared_state("card.last")
}

local function get_value(ctx, symbol)
  return ctx.query:read(Q[symbol]).value
end

local A = {}
for _, input in ipairs(GAME.inputs) do
  A[input.id] = input.actionId
end

local AUDIO_DAMAGE = 2
local AUDIO_BLOCK = 3
local AUDIO_ENEMY = 4
local AUDIO_VICTORY = 5
local AUDIO_DEFEAT = 6
local EFFECT_IMPACT = 1
local EFFECT_GUARD = 2
local EFFECT_VICTORY = 3

local cards_by_action = {}
for index, card in ipairs(RUN.cards) do
  cards_by_action[A[card.action]] = { definition = card, index = index }
end

-- State is read and written by declared name; the manifest owns the keys.
local function set_value(ctx, symbol, target)
  local current = get_value(ctx, symbol)
  if current ~= target then
    ctx.commands:add(symbol, target - current)
  end
end

local function begin_run(ctx)
  local first_room = RUN.rooms[1]
  set_value(ctx, S.phase, P.combat)
  set_value(ctx, S.player_health, RUN.run.maxHealth)
  set_value(ctx, S.enemy_health, first_room.enemy.health)
  set_value(ctx, S.energy, RUN.run.startingEnergy)
  set_value(ctx, S.block, 0)
  set_value(ctx, S.turn, 1)
  set_value(ctx, S.room, 1)
  set_value(ctx, S.cards_played, 0)
  set_value(ctx, S.card_last, 0)
end

local function play_card(ctx, card_entry)
  local card = card_entry.definition
  if get_value(ctx, S.phase) ~= P.combat then
    return
  end
  local energy = get_value(ctx, S.energy)
  if energy < card.cost then
    return
  end

  ctx.commands:add(S.energy, -card.cost)
  ctx.commands:add(S.cards_played, 1)
  set_value(ctx, S.card_last, card_entry.index)

  if card.effect.type == "block" then
    ctx.commands:add(S.block, card.effect.value)
    ctx.commands:play_audio(AUDIO_BLOCK, 1000)
    ctx.commands:spawn_effect(EFFECT_GUARD, 1000, -2200, 0, 0)
    return
  end

  local enemy_health = get_value(ctx, S.enemy_health)
  local damage = math.min(card.effect.value, enemy_health)
  ctx.commands:add(S.enemy_health, -damage)
  ctx.commands:play_audio(AUDIO_DAMAGE, 1000)
  ctx.commands:spawn_effect(EFFECT_IMPACT, 1000, 2200, 0, 0)
  if damage == enemy_health then
    local room = get_value(ctx, S.room)
    if room >= #RUN.rooms then
      set_value(ctx, S.phase, P.victory)
      ctx.commands:play_audio(AUDIO_VICTORY, 1000)
      ctx.commands:spawn_effect(EFFECT_VICTORY, 1400, 0, 0, 0)
    else
      set_value(ctx, S.phase, P.reward)
    end
  end
end

local function end_turn(ctx)
  if get_value(ctx, S.phase) ~= P.combat then
    return
  end
  local room = get_value(ctx, S.room)
  local attack = RUN.rooms[room].enemy.attack
  local block = get_value(ctx, S.block)
  local damage = math.max(0, attack - block)
  local health = get_value(ctx, S.player_health)
  set_value(ctx, S.block, 0)
  ctx.commands:play_audio(AUDIO_ENEMY, 1000)
  if damage >= health then
    set_value(ctx, S.player_health, 0)
    set_value(ctx, S.phase, P.defeat)
    ctx.commands:play_audio(AUDIO_DEFEAT, 1000)
    return
  end
  set_value(ctx, S.player_health, health - damage)
  set_value(ctx, S.energy, RUN.run.startingEnergy)
  ctx.commands:add(S.turn, 1)
end

local function choose_reward(ctx)
  if get_value(ctx, S.phase) ~= P.reward then
    return
  end
  local next_room = get_value(ctx, S.room) + 1
  local room = RUN.rooms[next_room]
  local health = get_value(ctx, S.player_health)
  set_value(ctx, S.phase, P.combat)
  set_value(ctx, S.player_health, math.min(RUN.run.maxHealth, health + RUN.run.rewardHeal))
  set_value(ctx, S.enemy_health, room.enemy.health)
  set_value(ctx, S.energy, RUN.run.startingEnergy)
  set_value(ctx, S.block, 0)
  set_value(ctx, S.turn, 1)
  set_value(ctx, S.room, next_room)
  set_value(ctx, S.card_last, 0)
end

return {
  on_input = function(ctx, event)
    if event.value_milli <= 0 then
      return
    end
    if event.action_id == A["start-run"] and get_value(ctx, S.phase) == P.idle then
      begin_run(ctx)
    elseif event.action_id == A.restart then
      begin_run(ctx)
    elseif event.action_id == A["end-turn"] then
      end_turn(ctx)
    elseif event.action_id == A["choose-reward"] then
      choose_reward(ctx)
    else
      local card = cards_by_action[event.action_id]
      if card ~= nil then
        play_card(ctx, card)
      end
    end
  end
}
