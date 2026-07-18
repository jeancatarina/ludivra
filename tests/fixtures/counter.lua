local SCORE_KEY = 1

return {
  on_input = function(ctx, event)
    if event.action_id == 1 and event.value_milli > 0 then
      ctx.commands:add_i64(SCORE_KEY, 1)
    end
  end
}
