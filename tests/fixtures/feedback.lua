return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      ctx.commands:play_audio(7, 750)
      ctx.commands:spawn_effect(9, 1250, 1000, -500, 250)
      ctx.commands:stop_audio(7)
    end
  end
}
