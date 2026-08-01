return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      ctx.commands:add_i64(20, ctx.time:tick())
    end
  end
}
