-- Timers bind once while the module loads, then use opaque references per tick.
local SCORE = SDK.symbol.state("score")
local WINDUP = SDK.symbol.timer("attack.windup")

return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      ctx.timers:start(WINDUP, 3)
    elseif event.action_id == 2 then
      ctx.timers:cancel(WINDUP)
    elseif event.action_id == 3 then
      -- Remaining is nil when the timer is not running.
      ctx.commands:add(SCORE, ctx.timers:remaining(WINDUP) or -1)
    end
  end,
  on_timer = function(ctx, event)
    if event.timer == "attack.windup" then
      ctx.commands:add(SCORE, 100)
    end
  end
}
