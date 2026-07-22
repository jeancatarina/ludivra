local GAME = CONTENT["ludivra.game"]
local RUN = CONTENT["ember-vault.run"]
local P = RUN.phases

local K = {}
for _, state in ipairs(GAME.inspection.integerStates) do
  K[state.id] = state.key
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

local function set_value(ctx, key, target)
  local current = ctx.query:get_i64(key)
  if current ~= target then
    ctx.commands:add_i64(key, target - current)
  end
end

local function begin_run(ctx)
  local first_room = RUN.rooms[1]
  set_value(ctx, K.phase, P.combat)
  set_value(ctx, K["player.health"], RUN.run.maxHealth)
  set_value(ctx, K["enemy.health"], first_room.enemy.health)
  set_value(ctx, K.energy, RUN.run.startingEnergy)
  set_value(ctx, K.block, 0)
  set_value(ctx, K.turn, 1)
  set_value(ctx, K.room, 1)
  set_value(ctx, K["cards.played"], 0)
  set_value(ctx, K["card.last"], 0)
end

local function play_card(ctx, card_entry)
  local card = card_entry.definition
  if ctx.query:get_i64(K.phase) ~= P.combat then
    return
  end
  local energy = ctx.query:get_i64(K.energy)
  if energy < card.cost then
    return
  end

  ctx.commands:add_i64(K.energy, -card.cost)
  ctx.commands:add_i64(K["cards.played"], 1)
  set_value(ctx, K["card.last"], card_entry.index)

  if card.effect.type == "block" then
    ctx.commands:add_i64(K.block, card.effect.value)
    ctx.commands:play_audio(AUDIO_BLOCK, 1000)
    ctx.commands:spawn_effect(EFFECT_GUARD, 1000, -2200, 0, 0)
    return
  end

  local enemy_health = ctx.query:get_i64(K["enemy.health"])
  local damage = math.min(card.effect.value, enemy_health)
  ctx.commands:add_i64(K["enemy.health"], -damage)
  ctx.commands:play_audio(AUDIO_DAMAGE, 1000)
  ctx.commands:spawn_effect(EFFECT_IMPACT, 1000, 2200, 0, 0)
  if damage == enemy_health then
    local room = ctx.query:get_i64(K.room)
    if room >= #RUN.rooms then
      set_value(ctx, K.phase, P.victory)
      ctx.commands:play_audio(AUDIO_VICTORY, 1000)
      ctx.commands:spawn_effect(EFFECT_VICTORY, 1400, 0, 0, 0)
    else
      set_value(ctx, K.phase, P.reward)
    end
  end
end

local function end_turn(ctx)
  if ctx.query:get_i64(K.phase) ~= P.combat then
    return
  end
  local room = ctx.query:get_i64(K.room)
  local attack = RUN.rooms[room].enemy.attack
  local block = ctx.query:get_i64(K.block)
  local damage = math.max(0, attack - block)
  local health = ctx.query:get_i64(K["player.health"])
  set_value(ctx, K.block, 0)
  ctx.commands:play_audio(AUDIO_ENEMY, 1000)
  if damage >= health then
    set_value(ctx, K["player.health"], 0)
    set_value(ctx, K.phase, P.defeat)
    ctx.commands:play_audio(AUDIO_DEFEAT, 1000)
    return
  end
  set_value(ctx, K["player.health"], health - damage)
  set_value(ctx, K.energy, RUN.run.startingEnergy)
  ctx.commands:add_i64(K.turn, 1)
end

local function choose_reward(ctx)
  if ctx.query:get_i64(K.phase) ~= P.reward then
    return
  end
  local next_room = ctx.query:get_i64(K.room) + 1
  local room = RUN.rooms[next_room]
  local health = ctx.query:get_i64(K["player.health"])
  set_value(ctx, K.phase, P.combat)
  set_value(ctx, K["player.health"], math.min(RUN.run.maxHealth, health + RUN.run.rewardHeal))
  set_value(ctx, K["enemy.health"], room.enemy.health)
  set_value(ctx, K.energy, RUN.run.startingEnergy)
  set_value(ctx, K.block, 0)
  set_value(ctx, K.turn, 1)
  set_value(ctx, K.room, next_room)
  set_value(ctx, K["card.last"], 0)
end

return {
  on_input = function(ctx, event)
    if event.value_milli <= 0 then
      return
    end
    if event.action_id == A["start-run"] and ctx.query:get_i64(K.phase) == P.idle then
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
