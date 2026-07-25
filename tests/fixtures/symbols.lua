-- Reads and writes authoritative state by declared name, never by numeric key.
return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      ctx.commands:add("score", ctx.state:get("score") + 5)
    elseif event.action_id == 2 then
      -- Undeclared symbols must fail the tick instead of reading key zero.
      ctx.commands:add("absent.symbol", 1)
    end
  end
}
