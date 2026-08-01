-- A missing symbol fails module loading, before the first authoritative tick.
local MISSING = SDK.symbol.state("absent.symbol")

return {
  on_input = function(ctx, event)
    ctx.commands:add(MISSING, event.value_milli)
  end
}
