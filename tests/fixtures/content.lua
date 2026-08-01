-- Content is obtained from the public SDK by compiled document ID at load time.
local RUN = SDK.content.get("ember-vault.run")
local SCORE = SDK.symbol.state("score")

return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      ctx.commands:add(SCORE, RUN.cards[1].damage)
    elseif event.action_id == 2 then
      -- Writing to content must fail: it would be hidden state outside the save.
      RUN.cards[1].damage = 999
    end
  end
}
