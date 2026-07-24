# ADR 0011 — Vertical slice de card roguelite e autoridade de conteúdo

- Status: aceito
- Data: 2026-07-22
- Revisão: antes de publicar um segundo formato de conteúdo autoritativo ou extrair uma capability genérica de cartas
- Sequenciamento atual: fixture antecipada conforme o [ADR 0012](0012-feature-first-roadmap-and-proof-games.md)
- Substituído em parte: a ponte `composeGameplaySource` será removida quando o content pack do [ADR 0017](0017-content-pack-compilation-and-migrations.md) carregar em todos os hosts; a autoridade única do JSONC permanece válida

## Contexto

O control protocol inicial provou inspeção e replay sobre um starter, mas ainda não havia exercitado um loop com início, progressão e fim. O `ENG-016` implementou um card roguelite real como fixture antecipada sem transformar prematuramente três cartas e dois encontros em um framework genérico. O ADR 0012 posteriormente reservou a prova completa dos jogos para a Fase 12; esta decisão de autoridade de conteúdo permanece válida.

Os valores de custo, dano, bloqueio, vida e ataque não podem existir simultaneamente em JSONC e Lua como duas fontes editáveis. O BrowserHost e o worker de controle também não podem preparar chunks Lua diferentes, pois isso invalidaria replay e equivalência entre execução visual e headless.

## Decisão

### Jogo de prova separado

O vertical slice viverá em `examples/card-roguelite`. `examples/first-game` continuará sendo o starter mínimo usado por `game new` e pelos testes de sessão fria. O jogo de prova não cria uma API pública chamada `card`, `deck` ou `combat`; uma capability reutilizável só será extraída depois de um segundo consumidor materialmente diferente.

### Autoridade de conteúdo

O manifest poderá registrar documentos em `content[]`, cada um com `id`, URI de schema e `source`. O documento do vertical slice seguirá `schemas/card-roguelite.schema.json`.

As fontes JSONC terão responsabilidades não sobrepostas:

- `game.jsonc` será a única autoridade para chaves numéricas de estado e IDs numéricos de ações;
- `content/run.jsonc` será a única autoridade para vida, energia, custos, efeitos, encontros, ataques, fases e recompensa;
- Lua e TypeScript referenciarão ações e estados por IDs semânticos, nunca repetirão os números.

Antes de carregar o gameplay, hosts e ferramentas analisarão os documentos JSONC e usarão as mesmas funções de `runtime-web`. `createGameplayManifestDocument` derivará do manifest o binding mínimo `ludivra.game`, e `composeGameplaySource` serializará esse binding e o conteúdo, com chaves ordenadas, em uma tabela local `CONTENT` anexada ao mesmo chunk do gameplay. Lua consumirá os dados por ID e não repetirá seus números.

Documentos ausentes, fora do projeto, com schema desconhecido, inválidos ou inconsistentes com inputs e estado inspecionável falharão em `game validate`. A composição não executará texto proveniente do documento como código Lua; somente valores JSON validados serão serializados.

### Máquina de estados do jogo

O slice terá estados explícitos `idle`, `combat`, `reward`, `victory` e `defeat`, representados por inteiros autoritativos e declarados no manifest. O loop será:

`idle → combat 1 → reward → combat 2 → victory`

O caminho de derrota terminará em `defeat`. Reinício será uma ação lógica explícita. Cartas consumirão energia; encerramento de turno aplicará bloqueio e ataque inimigo; a recompensa avançará o encontro e curará conforme o conteúdo.

O estado comprometido continuará pertencendo ao kernel. Apresentação, áudio e efeitos somente projetarão esse estado e não poderão decidir dano, vitória ou derrota. Saves e replays existentes armazenarão e verificarão todos os inteiros sem um formato paralelo específico do jogo.

### Escopo do ENG-016

O gate exige cenários determinísticos de vitória, derrota e regra de energia/bloqueio, além de build do BrowserHost. `UiViewModel` derivado do DOM real e captura raster pertencem a `ENG-017` e `ENG-018`; a captura SVG headless não será promovida como evidência de pixels.

## Consequências

- o primeiro jogo real possui uma fonte textual única para balanceamento;
- BrowserHost e control worker carregam exatamente o mesmo chunk composto;
- o conteúdo é validado e suas referências semânticas são correlacionadas a ações do manifest;
- saves e replays cobrem o loop sem ampliar o ABI nativo;
- o código Lua permanece específico ao jogo e pequeno;
- a engine ganha um mecanismo mínimo de binding de conteúdo, mas não afirma oferecer um card framework reutilizável;
- mudanças futuras no schema do conteúdo exigirão versão e migração explícitas.

## Alternativas rejeitadas

- duplicar números em Lua e JSONC: cria autoridades concorrentes e diffs difíceis de verificar;
- gerar e versionar um segundo arquivo Lua com os mesmos dados: adiciona artefato derivado sujeito a ficar desatualizado;
- interpretar expressões Lua vindas do JSONC: reintroduz código arbitrário no formato declarativo;
- adicionar cartas diretamente ao kernel C++: acopla um jogo específico ao estado autoritativo reutilizável;
- extrair agora um ECS de cartas, deck builder ou combat framework: não há segundo consumidor que justifique o contrato.
