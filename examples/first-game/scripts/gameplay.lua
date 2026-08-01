local CORE_CHARGE = SDK.symbol.state("core.charge")
local CORE = SDK.query.declare({ charge = CORE_CHARGE })
local ACTION_CHARGE = 1
local ACTION_RESET = 2

return {
  on_input = function(ctx, event)
    if event.value_milli <= 0 then
      return
    end
    if event.action_id == ACTION_CHARGE then
      ctx.commands:add(CORE_CHARGE, 1)
      ctx.commands:play_audio(2, 1000)
      ctx.commands:spawn_effect(1, 1000, 0, 0, 0)
    elseif event.action_id == ACTION_RESET then
      local current = ctx.query:read(CORE).charge
      ctx.commands:add(CORE_CHARGE, -current)
      ctx.commands:play_audio(3, 1000)
    end
  end
}
