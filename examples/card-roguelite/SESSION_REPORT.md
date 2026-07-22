# Última sessão

O `ENG-016` implementou o loop jogável do Cofre das Brasas na Ludivra 0.7.0.

O conteúdo canônico está em `content/run.jsonc`; BrowserHost e control worker compõem o mesmo chunk Lua. Os cenários `run-victory`, `run-defeat` e `guard-and-energy` verificam progressão, estados terminais, custo de energia, bloqueio e replay.

Ainda não há snapshot do DOM real nem captura raster. Essas evidências pertencem, respectivamente, ao `ENG-017` e ao `ENG-018`.
