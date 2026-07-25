-- Content arrives from the pack as a read-only global, at load time.
local RUN = CONTENT["ember-vault.run"]

return {
  on_input = function(ctx, event)
    if event.action_id == 1 then
      ctx.commands:add("score", RUN.cards[1].damage)
    elseif event.action_id == 2 then
      -- Writing to content must fail: it would be hidden state outside the save.
      RUN.cards[1].damage = 999
    end
  end
}
