local SCORE_KEY = 30

return {
  on_input = function(_ctx, _event)
  end,
  on_statechart_guard = function(ctx, event)
    return event.id == "guard.ready" and ctx.query:get_i64(SCORE_KEY) == 0
  end,
  on_statechart_action = function(ctx, event)
    if event.id == "action.transition" and event.phase == "transition" then
      ctx.commands:add_i64(SCORE_KEY, 10)
    elseif event.id == "action.enter" and event.phase == "entry" then
      ctx.commands:add_i64(SCORE_KEY, 1)
    end
  end
}
