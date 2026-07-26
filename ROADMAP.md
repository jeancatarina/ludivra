# Roadmap técnico da Ludivra

> Gerado de `docs/program-status.json` e dos metadados dos ADRs por `tools/program-status/generate.mjs`. Não edite manualmente.

| Campo | Valor |
|---|---|
| Release atual | 0.7.0 |
| Foco atual | Fase 3 — Fechar os códigos específicos de renderer e shader e ampliar a matriz mínima de baselines. |
| Próxima entrega | Concluir o gate da Fase 4 antes de ampliar novamente a fundação espacial. |
| Fonte editável de progresso | [docs/program-status.json](docs/program-status.json) |
| Decisão do modelo documental | [ADR 0046](docs/adr/0046-generated-program-documentation.md) |

## Fontes de verdade

- `architecture.md`: boundaries, princípios e objetivos do programa;
- `docs/adr/*.md`: decisões duráveis e seus status;
- `capabilities/*/capability.json`: estado e limitações de cada capability;
- `docs/program-status.json`: progresso, backlog, targets e jogos de prova;
- `reports/runs/*/run-manifest.json`: evidência imutável de execução;
- `ROADMAP.md`, `BACKLOG.md`, `DECISIONS.md` e `CAPABILITIES.json`: índices derivados.

## Visão geral

| Fase | Fundação técnica | Estado | Principal lacuna |
|---:|---|---|---|
| 1 | Estado canônico e catálogo de capacidades | `CONCLUÍDA` | nenhuma no gate atual |
| 2 | Context Engine, CLI e Development Runner | `CONCLUÍDA` | nenhuma no gate atual |
| 3 | AI Control Plane e observabilidade causal | `EM ANDAMENTO` | Códigos próprios para falhas de renderer e shader em vez de erro de script genérico. |
| 4 | Autoria text-first de gameplay, UI e conteúdo | `PARCIAL` | Contrato público e versionado da camada 1 do SDK, incluindo queries declarativas e maturidade por símbolo. |
| 5 | Runtime espacial e mundo procedural | `PARCIAL` | Jobs assíncronos reais sem alterar a ordem de commit. |
| 6 | Motion, física e Mass Simulation | `PLANEJADA` | Motion por tempo declarado e comandos semânticos. |
| 7 | Persistência, replays e multiplayer player-hosted | `PARCIAL` | Region storage atômico com journal, compactação, recovery e migrations. |
| 8 | Renderer, UI, áudio e apresentação escalável | `PARCIAL` | Buffers contíguos, instancing, LOD, culling, pooling e terrain streaming. |
| 9 | Procedural Construction Runtime | `PLANEJADA` | Construction Graph, comandos semânticos, undo/redo e replay. |
| 10 | Procedural Forges | `PARCIAL` | Completar música, stems, previews gráficos e runtime/cooker do Audio Forge. |
| 11 | Diagnose, Repair, Verify e performance gates | `PARCIAL` | Fluxo real de diagnose, explain, fix dry-run/apply e verify com classes de reparo. |
| 12 | Cinco jogos de prova e sessões frias | `PLANEJADA` | Card roguelite como jogo final, além da fixture antecipada. |

## Caminho crítico

```text
Estado e operabilidade (1–4)
          ↓
Escala, física, persistência e apresentação (5–8)
          ↓
Construção, Forges e autonomia (9–11)
          ↓
Cinco jogos de prova e sessões frias (12)
```

## Fase 1 — Estado canônico e catálogo de capacidades

| Campo | Valor |
|---|---|
| Estado | `CONCLUÍDA` |
| Owners | CLI, contratos de estado |
| Dependências | nenhuma |
| ADRs | [ADR 0009](docs/adr/0009-canonical-state-and-run-evidence.md) |

Dar à IA uma representação única, navegável e regenerável do estado da engine e do projeto.

### Entregue

- Estado derivado, catálogo de capabilities, manifests de run e fitness functions. Evidência: [cli/src/project-state.ts](cli/src/project-state.ts), [CAPABILITIES.json](CAPABILITIES.json), [contracts/run-manifest.schema.json](contracts/run-manifest.schema.json).

### Gate de saída

Uma sessão nova encontra estado, capabilities, limitações e evidência compatível sem pesquisar o repositório inteiro.

## Fase 2 — Context Engine, CLI e Development Runner

| Campo | Valor |
|---|---|
| Estado | `CONCLUÍDA` |
| Owners | CLI, BrowserHost, ElectronHost |
| Dependências | Fase 1 |
| ADRs | [ADR 0013](docs/adr/0013-development-runner-cache-and-lifecycle.md) |

Fazer da CLI a interface operacional oficial entre IA, engine, hosts e toolchain.

### Entregue

- CLI estruturada, cache por família, watch afetado e lifecycle de processos com dono único. Evidência: [cli/src/artifact-cache.ts](cli/src/artifact-cache.ts), [cli/src/build-runner.ts](cli/src/build-runner.ts), [cli/src/process-runner.ts](cli/src/process-runner.ts).

### Gate de saída

Uma sessão executa, interrompe, reconstrói e inspeciona um projeto com comandos reproduzíveis e sem processos órfãos.

## Fase 3 — AI Control Plane e observabilidade causal

| Campo | Valor |
|---|---|
| Estado | `EM ANDAMENTO` |
| Owners | CLI, control protocol, scenario harness, BrowserHost |
| Dependências | Fase 1, Fase 2 |
| ADRs | [ADR 0010](docs/adr/0010-local-control-protocol-and-scenario-harness.md), [ADR 0014](docs/adr/0014-declarative-ui-contracts-and-initial-renderer.md), [ADR 0015](docs/adr/0015-raster-capture-and-visual-baselines.md) |

Permitir que a IA controle uma execução real e rastreie um defeito do input até a apresentação.

### Entregue

- Control protocol, harness, replay, contratos de UI e captura raster com baseline. Capabilities: `operability.control-harness`. Evidência: [contracts/control-protocol.schema.json](contracts/control-protocol.schema.json), [cli/src/scenario-harness.ts](cli/src/scenario-harness.ts), [cli/src/raster-capture.ts](cli/src/raster-capture.ts).
- Cadeia de pixels para trace de projeção, estado lógico e tick no mesmo run. Evidência: [renderer-three/src/index.ts](renderer-three/src/index.ts), [contracts/rendered-ui-snapshot.schema.json](contracts/rendered-ui-snapshot.schema.json).

### Falta

- Códigos próprios para falhas de renderer e shader em vez de erro de script genérico.
- Baselines aprovadas para a matriz mínima de viewport, escala de texto e device scale factor.

### Gate de saída

Um defeito nos pixels é correlacionado a estado, ação, evento, projector e origem, reproduzido por cenário e anexado ao artifact bundle.

## Fase 4 — Autoria text-first de gameplay, UI e conteúdo

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners | kernel, Lua SDK, content compiler, presentation protocol |
| Dependências | Fase 3 |
| ADRs | [ADR 0004](docs/adr/0004-lua-sandbox.md), [ADR 0016](docs/adr/0016-public-lua-sdk-layers-and-escape-hatches.md), [ADR 0017](docs/adr/0017-content-pack-compilation-and-migrations.md), [ADR 0018](docs/adr/0018-numeric-determinism-and-rng-streams.md), [ADR 0044](docs/adr/0044-approved-native-extension-process.md) |

Permitir que jogos sejam criados por APIs públicas textuais sem alterar internals da engine.

### Entregue

- Lua sandboxed com estado por símbolo, timers, fixed-point, streams de RNG e diagnósticos estáveis. Capabilities: `runtime.lua-gameplay`. Evidência: [kernel/src/lua_sandbox.cpp](kernel/src/lua_sandbox.cpp), [tests/runtime/runtime_test.cpp](tests/runtime/runtime_test.cpp), [tests/fixtures/determinism.lua](tests/fixtures/determinism.lua).
- Content pack versionado, determinístico, rastreável e carregado pelo kernel em todos os hosts. Capabilities: `runtime.content-binding`. Evidência: [content-compiler/src/pack.ts](content-compiler/src/pack.ts), [kernel/src/content_pack.cpp](kernel/src/content_pack.cpp), [tools/tests/card-roguelite.mjs](tools/tests/card-roguelite.mjs).

### Falta

- Contrato público e versionado da camada 1 do SDK, incluindo queries declarativas e maturidade por símbolo.
- Projectors read-only declarados e medidos separadamente.
- Migrations explícitas de schema e conteúdo com fixtures.
- Gate integrado de UI, localização, navegação, foco, touch targets e breakpoints.

### Gate de saída

Uma sessão nova cria regra, conteúdo, tela, apresentação e cenário usando apenas APIs públicas.

## Fase 5 — Runtime espacial e mundo procedural

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners | kernel spatial runtime, world runtime, job system |
| Dependências | Fase 4 |
| ADRs | [ADR 0018](docs/adr/0018-numeric-determinism-and-rng-streams.md), [ADR 0019](docs/adr/0019-spatial-model-chunk-lifecycle-and-job-commit.md), [ADR 0039](docs/adr/0039-entity-component-layer.md), [ADR 0045](docs/adr/0045-wasm-threads-and-shared-memory.md) |

Criar uma fundação opt-in para mapas pequenos, mundos extensos e sandboxes virtualmente infinitos.

### Entregue

- Posição composta, identidade e lifecycle de chunk, commit determinístico de jobs e geração pura sem seams. Capabilities: `spatial.runtime-foundation`. Evidência: [kernel/src/world_position.cpp](kernel/src/world_position.cpp), [kernel/src/world_chunks.cpp](kernel/src/world_chunks.cpp), [tests/kernel/kernel_test.cpp](tests/kernel/kernel_test.cpp).
- Janela de streaming com residência estável e regeneração idêntica ao revisitar. Evidência: [kernel/src/world_streaming.cpp](kernel/src/world_streaming.cpp), [capabilities/spatial-runtime-foundation/capability.json](capabilities/spatial-runtime-foundation/capability.json).

### Falta

- Jobs assíncronos reais sem alterar a ordem de commit.
- Simulation LOD, catch-up lógico e inspeção de regiões, chunks, jobs e caches.
- Posição com região e partitioning interno comprovado pelo consumidor.
- Superfície pública apenas quando um jogo declarar a capability.

### Gate de saída

O runtime gera, carrega, descarta e regenera chunks determinísticos com memória estabilizada em viagens longas.

## Fase 6 — Motion, física e Mass Simulation

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Owners | motion runtime, physics adapters, Mass Runtime |
| Dependências | Fase 5 |
| ADRs | [ADR 0021](docs/adr/0021-motion-and-physics-adapter-authority.md), [ADR 0022](docs/adr/0022-mass-runtime-storage-levels-and-budgets.md), [ADR 0037](docs/adr/0037-physics-solver-selection.md), [ADR 0045](docs/adr/0045-wasm-threads-and-shared-memory.md) |

Entregar movimento formal, física por adapters e multidões em níveis de simulação declarados.

### Falta

- Motion por tempo declarado e comandos semânticos.
- Adapters Jolt 3D e Box2D 2D com autoridade, quantização e replay.
- Mass Runtime contíguo, níveis de simulação, promoção controlada e budgets.

### Gate de saída

Movimento, física e hordas permanecem observáveis, reproduzíveis e dentro dos budgets aprovados.

## Fase 7 — Persistência, replays e multiplayer player-hosted

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners | kernel, storage, network runtime |
| Dependências | Fase 5, Fase 6 |
| ADRs | [ADR 0023](docs/adr/0023-world-persistence-and-region-storage.md), [ADR 0024](docs/adr/0024-player-hosted-multiplayer-and-protocol-compatibility.md), [ADR 0038](docs/adr/0038-network-transport-adapters.md) |

Preservar mundo e sessões player-hosted com compatibilidade e recuperação explícitas.

### Entregue

- Saves lógicos versionados, migrations básicas, replays, checkpoints e equivalência native/WASM. Capabilities: `runtime.save-replay`. Evidência: [kernel/src/state_archive.cpp](kernel/src/state_archive.cpp), [kernel/src/runtime.cpp](kernel/src/runtime.cpp), [tools/tests/wasm-equivalence.mjs](tools/tests/wasm-equivalence.mjs).

### Falta

- Region storage atômico com journal, compactação, recovery e migrations.
- Salvamento por seed, generator version e deltas sem duplicar o mundo regenerável.
- Salas host-authoritative, transport adapters, late join, reconexão e host migration.

### Gate de saída

Save mundial sobrevive a crash e migration, replay localiza divergência e uma sala casual suporta seu lifecycle completo.

## Fase 8 — Renderer, UI, áudio e apresentação escalável

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners | presentation protocol, renderer-three, UI renderer, hosts |
| Dependências | Fase 3, Fase 4, Fase 5, Fase 6, Fase 7 |
| ADRs | [ADR 0014](docs/adr/0014-declarative-ui-contracts-and-initial-renderer.md), [ADR 0015](docs/adr/0015-raster-capture-and-visual-baselines.md), [ADR 0020](docs/adr/0020-presentation-buffers-and-wasm-memory.md), [ADR 0025](docs/adr/0025-audio-backends-voice-budgets-and-fallback.md), [ADR 0040](docs/adr/0040-ui-framework-and-diegetic-ui.md) |

Apresentar jogos pequenos e massivos com observabilidade e degradação sem alterar gameplay.

### Entregue

- Renderer Three.js experimental, UI DOM acessível, Web Audio e partículas simples. Capabilities: `presentation.three`, `feedback.audio-effects`. Evidência: [renderer-three/src](renderer-three/src), [hosts/browser/src/ui-renderer.ts](hosts/browser/src/ui-renderer.ts), [hosts/browser/src/audio-feedback.ts](hosts/browser/src/audio-feedback.ts).

### Falta

- Buffers contíguos, instancing, LOD, culling, pooling e terrain streaming.
- UI completa por teclado, controle e touch com baselines por perfil.
- Budgets de voz e memória, prioridade, deduplicação, música adaptativa e fallback observável.

### Gate de saída

A IA explica falhas de apresentação e a carga massiva permanece dentro dos budgets aprovados.

## Fase 9 — Procedural Construction Runtime

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Owners | construction runtime, geometry compiler, authoring toolkit |
| Dependências | Fase 5, Fase 6, Fase 8 |
| ADRs | [ADR 0026](docs/adr/0026-construction-graph-as-source-of-truth.md), [ADR 0035](docs/adr/0035-construction-forge-style-grammars.md) |

Permitir construção procedural interativa cuja fonte de verdade seja um grafo semântico.

### Falta

- Construction Graph, comandos semânticos, undo/redo e replay.
- Building Chemistry, constraint solver e Geometry Compiler incremental.
- Terrain sculpting, ferramentas semânticas e rastreabilidade de derivados.

### Gate de saída

Uma edição reconstrói apenas a região necessária e toda consequência derivada é explicável.

## Fase 10 — Procedural Forges

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners | authoring toolchains |
| Dependências | Fase 4, Fase 5, Fase 6, Fase 7, Fase 8, Fase 9 |
| ADRs | [ADR 0027](docs/adr/0027-forge-output-contract-and-authoring-boundary.md), [ADR 0032](docs/adr/0032-audio-forge-recipes-and-deterministic-renderer.md), [ADR 0033](docs/adr/0033-visual-forge-procedural-characters-and-generated-surfaces.md), [ADR 0034](docs/adr/0034-world-forge-textual-world-recipes.md), [ADR 0035](docs/adr/0035-construction-forge-style-grammars.md), [ADR 0036](docs/adr/0036-physics-forge-collider-and-stability-recipes.md) |

Produzir assets e receitas convencionais, rastreáveis e regeneráveis em cinco famílias.

### Entregue

- Audio Forge possui receita JSONC, render determinístico, análise, cache, cooker e comandos de CLI. Capabilities: `authoring.audio-forge`. Evidência: [capabilities/authoring-audio-forge/capability.json](capabilities/authoring-audio-forge/capability.json), [audio-authoring/src](audio-authoring/src), [cli/src/audio-forge.ts](cli/src/audio-forge.ts).
- Visual Forge possui Style Bible, CharacterSpec, gerador skeleton-first, skinning, superfícies compiladas, glTF, preview, validação e jobs de CLI. Capabilities: `authoring.visual-forge`. Evidência: [capabilities/authoring-visual-forge/capability.json](capabilities/authoring-visual-forge/capability.json), [visual-authoring/src](visual-authoring/src), [cli/src/visual-forge.ts](cli/src/visual-forge.ts).

### Falta

- Completar música, stems, previews gráficos e runtime/cooker do Audio Forge.
- Implementar World, Construction e Physics Forges.
- Aplicar o manifest comum de Forge, origem, licença, preview e regeneração.

### Gate de saída

Os cinco Forges produzem artefatos rastreáveis usados nas fixtures e preparados para os jogos finais.

## Fase 11 — Diagnose, Repair, Verify e performance gates

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners | CLI, diagnostics, benchmark registry, target hardening |
| Dependências | Fase 3, Fase 4, Fase 5, Fase 6, Fase 7, Fase 8, Fase 9, Fase 10 |
| ADRs | [ADR 0028](docs/adr/0028-diagnose-repair-verify-and-repair-classes.md), [ADR 0029](docs/adr/0029-benchmark-registry-profiles-and-baselines.md), [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md), [ADR 0031](docs/adr/0031-native-diagnostic-host-trigger-and-criteria.md), [ADR 0043](docs/adr/0043-native-diagnostic-host-backend.md) |

Transformar falhas e regressões em diagnóstico causal, reparo controlado e comparação verificável.

### Entregue

- Diagnósticos estruturados, artifact bundles, replay, hashes, timeline e classificações de disponibilidade. Evidência: [contracts/cli-result.schema.json](contracts/cli-result.schema.json), [contracts/run-manifest.schema.json](contracts/run-manifest.schema.json), [cli/src/result.ts](cli/src/result.ts).

### Falta

- Fluxo real de diagnose, explain, fix dry-run/apply e verify com classes de reparo.
- Registry de métricas, profiles e benchmarks oficiais por target.
- Hardening, SBOM, provenance, licença e smoke instalado.

### Gate de saída

Todo reparo possui regressão e comparação de evidência; falhas de performance apontam o sistema responsável.

## Fase 12 — Cinco jogos de prova e sessões frias

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Owners | programa Ludivra |
| Dependências | Fase 1, Fase 2, Fase 3, Fase 4, Fase 5, Fase 6, Fase 7, Fase 8, Fase 9, Fase 10, Fase 11 |
| ADRs | [ADR 0008](docs/adr/0008-mandatory-scale-and-procedural-capabilities.md), [ADR 0012](docs/adr/0012-feature-first-roadmap-and-proof-games.md) |

Comprovar integração, reuso, targets e continuidade por IA em cinco jogos materialmente diferentes.

### Falta

- Card roguelite como jogo final, além da fixture antecipada.
- Survivor-like, physics party brawler, procedural sandbox e procedural diorama builder.
- Sessão fria completa e gates funcionais, visuais, de target e performance por jogo.

### Gate de saída

Os cinco jogos passam pelos gates aplicáveis usando releases compatíveis da engine.

## Target matrix

| Target | Estado atual | Situação | Para alegar suporte |
|---|---|---|---|
| Native headless | `experimental` | Executado em CI e nos testes nativos. | Manter equivalência e corpus de replays verdes. |
| Browser | `experimental` | Host WASM, Three.js, UI DOM e controle local existem. | Fechar Control Plane, budgets e fallbacks gráficos. |
| Electron/macOS | `experimental` | Pacote local, lifecycle, storage e Steam opcional existem. | Smoke instalado e política de assinatura. |
| Electron/Windows | `NOT_RUN` | Empacotamento existe sem smoke no target. | Build e smoke em runner Windows. |
| Electron/Linux | `NOT_RUN` | Empacotamento existe sem smoke no target. | Build e smoke em runner Linux. |
| Android | `NOT_AVAILABLE` | Host não implementado. | Host, lifecycle, touch, persistência e dispositivo real. |
| iOS | `NOT_AVAILABLE` | Host não implementado. | Host, lifecycle, touch, persistência e dispositivo real. |
| Consoles | `rota futura` | Rota arquitetural futura. | Acesso oficial, infraestrutura privada e hosts/renderers nativos. |

## Jogos de prova

| Jogo | Estado | Comprova |
|---|---|---|
| Card roguelite | fixture antecipada | Determinismo, conteúdo, UI declarativa, saves, replays, áudio, captura e operação. |
| Survivor-like | planejado | Spatial grid, Mass Runtime, instancing, partículas e performance. |
| Physics party brawler | planejado | Física 3D, ragdolls, multiplayer, reconexão e host migration. |
| Procedural indie sandbox | planejado | Chunks, streaming, geração, persistência por deltas e Simulation LOD. |
| Procedural diorama builder | planejado | Construction Graph, constraints, geometria incremental e terrain sculpting. |

## Definition of Done de uma capability

Uma capability só deixa de ser experimental quando os itens aplicáveis respondem `PASS`:

```text
Discover → Author → Execute → Observe → Diagnose → Repair → Verify → Continue
```

`NOT_RUN`, `NOT_AVAILABLE` e `INCONCLUSIVE` nunca equivalem a `PASS`.

## Regra de atualização

No mesmo change set que altera progresso:

1. edite `docs/program-status.json` e o manifest da capability afetada;
2. aponte toda entrega declarada para evidência versionada;
3. execute `pnpm run docs` para regenerar os índices;
4. execute `pnpm run docs:check` ou `game validate` para provar ausência de divergência.

Detalhes técnicos pertencem aos ADRs e à arquitetura. O roadmap registra ordem, estado, evidência, lacunas e gates; não duplica protocolos ou decisões.
