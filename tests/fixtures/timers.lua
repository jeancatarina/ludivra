-- Timers measured in logical ticks, with the expiry observable by the script.
return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      ctx.timers:start("attack.windup", 3)
    elseif event.action_id == 2 then
      ctx.timers:cancel("attack.windup")
    elseif event.action_id == 3 then
      -- Remaining is nil when the timer is not running.
      ctx.commands:add("score", ctx.timers:remaining("attack.windup") or -1)
    end
  end,
  on_timer = function(ctx, event)
    if event.timer == "attack.windup" then
      ctx.commands:add("score", 100)
    end
  end
}
