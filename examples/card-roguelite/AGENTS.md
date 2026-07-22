# Instruções para agentes

1. Leia `game.jsonc`, `content/run.jsonc` e `scripts/gameplay.lua` antes de alterar regras.
2. Valores de balanceamento pertencem somente a `content/run.jsonc`; IDs numéricos de ação e estado pertencem somente a `game.jsonc`. Não os duplique em Lua ou TypeScript.
3. Preserve as transições `idle → combat → reward → combat → victory` e o caminho `combat → defeat`.
4. Execute `game status`, `game validate` e os três cenários após qualquer mudança lógica.
5. Não use captura SVG headless como evidência de pixels do BrowserHost.
6. Registre evidência e limitações em `SESSION_REPORT.md`.
