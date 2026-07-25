-- Exercises the ADR 0018 surface: domain-separated draws and fixed-point math.
local ROLL_KEY = 10
local SCALED_KEY = 11
local CHANCE_KEY = 12

return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      -- Two domains: consuming one must not move the other.
      local roll = ctx.random:range("combat.damage", 1, 6)
      local chance = ctx.random:unit_milli("loot.drop")
      ctx.commands:add_i64(ROLL_KEY, roll)
      ctx.commands:add_i64(CHANCE_KEY, chance)
      -- Multiplication in the declared milli scale, never a float.
      ctx.commands:add_i64(SCALED_KEY, ctx.fixed:mul(event.value_milli, 1500))
    end
  end
}
