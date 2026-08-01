return {
  on_input = function(ctx, event)
    if event.action_id == 91 then
      ctx.world:set_delta(7, -2, 0, 4, 3, 1, -5, "placed-by-lua")
    end
  end
}
