-- Symbols and the query plan bind while this module loads, never in a tick.
local SCORE = SDK.symbol.state("score")
local SCORE_QUERY = SDK.query.declare({ score = SCORE })

return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      local values = ctx.query:read(SCORE_QUERY)
      ctx.commands:add(SCORE, values.score + ctx.query:cost(SCORE_QUERY))
    end
  end
}
