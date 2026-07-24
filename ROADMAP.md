# Roadmap técnico da Ludivra

> Sequência feature-first para construir uma engine AI-first, text-first, observável, reparável, procedural e preparada para escala.

| Campo | Valor |
|---|---|
| Versão do roadmap | 3.0 |
| Data-base | 2026-07-22 |
| Release atual | 0.7.0 |
| Prioridade atual | Fechar o P0 das Fases 2–3 — runner, controle e observabilidade real |
| Próxima entrega | `ENG-017`, seguida de `ENG-018` |
| Decisão de sequência | [ADR 0012](docs/adr/0012-feature-first-roadmap-and-proof-games.md) |
| Prova final | Fase 12 — cinco jogos e sessões frias |

## 1. Objetivo do programa

A Ludivra deverá permitir que uma IA crie e evolua jogos completos usando fontes textuais, contratos semânticos, comandos reproduzíveis, cenários automatizados e evidências ligadas ao estado do repositório.

A unidade de entrega é:

> Uma alteração versionada, executável, observável, diagnosticável, verificável e continuável por outra sessão de IA.

O roadmap constrói primeiro as capacidades da engine. Os jogos completos aparecem na Fase 12 para provar que essas capacidades funcionam integradas. Exemplos e protótipos podem existir antes como fixtures técnicas; eles não contam como jogos concluídos.

## 2. Como ler o roadmap

### 2.1 Estados

| Estado | Significado |
|---|---|
| `CONCLUÍDA` | O gate técnico da fase passou no escopo declarado |
| `EM ANDAMENTO` | É a prioridade ativa e ainda possui gate aberto |
| `PARCIAL` | Existem componentes úteis, mas a fase não passou seu gate |
| `PLANEJADA` | A capability ainda não possui implementação material |
| `NOT_AVAILABLE` | O target ou operação ainda não existe |
| `NOT_RUN` | Existe implementação, mas falta execução no ambiente exigido |

Os estados são baseados em evidência. Código compilando, protótipo visual ou teste isolado não promove uma fase automaticamente.

### 2.2 Termos

| Termo | Significado |
|---|---|
| Capability | capacidade modular da engine, opt-in por projeto |
| Fixture técnica | consumidor mínimo usado para testar um contrato ou boundary |
| Gate | condições obrigatórias para encerrar uma fase |
| Jogo de prova | integração completa usada na Fase 12 |
| Sessão fria | IA sem memória anterior operando apenas pelo repositório |
| Artifact bundle | manifest, diagnósticos, métricas, traces, capturas e builds de um run |

### 2.3 Fontes canônicas

| Assunto | Fonte |
|---|---|
| Fronteiras e premissa | [architecture.md](architecture.md) |
| Decisões duráveis | [DECISIONS.md](DECISIONS.md) e ADRs |
| Ordem e gates | este roadmap |
| Tarefas do marco ativo | [BACKLOG.md](BACKLOG.md) |
| Estado executado | `.ludivra/project-state.json` e `reports/runs/` |

## 3. Visão geral das fases

| Fase | Fundação técnica | Estado atual | Evidência existente | Principal lacuna |
|---|---|---|---|---|
| 1 | Estado canônico e catálogo | `CONCLUÍDA` | `game status`, catálogo e manifests de run | nenhuma no gate atual |
| 2 | Context Engine, CLI e Development Runner | `EM ANDAMENTO` | CLI, BrowserHost e ElectronHost experimentais | cache/watch e lifecycle incremental |
| 3 | Control Plane e observabilidade causal | `EM ANDAMENTO` | harness headless, replay, SVG e sessão fria | UI e raster reais do BrowserHost |
| 4 | Autoria text-first | `PARCIAL` | Lua, JSONC, schemas e content binding | UI declarativa e content pack |
| 5 | Runtime espacial e mundo procedural | `PLANEJADA` | — | modelo espacial, chunks, jobs e streaming |
| 6 | Motion, física e Mass Simulation | `PLANEJADA` | primitivas visuais não autoritativas | motion formal, adapters físicos e Mass Runtime |
| 7 | Persistência, replay e multiplayer | `PARCIAL` | saves e replays lógicos | persistência mundial e rede player-hosted |
| 8 | Renderer, UI e áudio escaláveis | `PARCIAL` | Three.js, Web Audio e partículas simples | buffers, instancing, LOD, UI real e budgets |
| 9 | Construction Runtime | `PLANEJADA` | — | grafo, solver e compiler incremental |
| 10 | Forges procedurais | `PLANEJADA` | receitas locais isoladas não formam Forges | cinco pipelines completos e rastreáveis |
| 11 | Diagnose, Repair, Verify e performance | `PARCIAL` | diagnósticos, gates e artifact bundles básicos | reparo controlado e benchmarks oficiais |
| 12 | Cinco jogos de prova e sessões frias | `PLANEJADA` | card roguelite antecipado como fixture | integração final dos cinco jogos |

O histórico contém trabalho feito fora dessa ordem. `PARCIAL` registra esse fato sem fingir que o gate da fase passou.

## 4. Caminho crítico

```text
P0 — OPERABILIDADE

1. Estado canônico
        ↓
2. CLI e Development Runner
        ↓
3. Control Plane e observabilidade real
        ↓
4. Autoria text-first completa

P1 — FUNDAÇÕES DE ESCALA

5. Runtime espacial e mundo procedural
        ↓
6. Motion, física e Mass Simulation
        ↓
7. Persistência mundial, replay e multiplayer
        ↓
8. Renderer, UI e áudio escaláveis

P2 — CRIAÇÃO PROCEDURAL E AUTONOMIA

9. Construction Runtime
        ↓
10. Forges procedurais
        ↓
11. Diagnose–Repair–Verify e performance gates

P3 — COMPROVAÇÃO

12. Cinco jogos de prova + sessões frias
```

Observabilidade e diagnóstico básico são transversais: nenhuma fase pode adiar toda a sua inspeção para a Fase 11. A Fase 11 consolida reparo, comparação de evidências, benchmarks oficiais e hardening, não corrige retroativamente capabilities cegas.

## 5. Fase 1 — Estado canônico e catálogo de capacidades

| Campo | Valor |
|---|---|
| Estado | `CONCLUÍDA` |
| ADR de base | [ADR 0009](docs/adr/0009-canonical-state-and-run-evidence.md) |
| Release de referência | 0.5.0 |
| Owner principal | CLI e contratos de estado |

### Objetivo

Dar à IA uma representação única, navegável e regenerável do estado da engine e do projeto.

### Entregue

- `.ludivra/project-state.json` regenerado por `game status`;
- commit, dirty state, worktree hash, engine, projeto e último run compatível;
- `CAPABILITIES.json` gerado e validado;
- manifests de capability com owner, versão, targets, contratos, exemplos, verificação e limitações;
- manifests de run com comando, versões, target, hashes e artefatos;
- schemas e fitness functions para divergência de arquivos gerados, packages e CMake;
- estados de capability explícitos, sem converter experimental em estável por inferência.

### Decisão de escopo

Não serão criados `module-index`, `target-index`, `diagnostic-index` e outros arquivos concorrentes enquanto consultas sobre o catálogo e o estado composto forem suficientes. Índices novos exigem consumidor e necessidade medida.

### Gate concluído

Uma sessão nova encontra o estado, as capabilities, as limitações e a evidência compatível sem pesquisar o repositório inteiro.

## 6. Fase 2 — Context Engine, CLI e Development Runner

| Campo | Valor |
|---|---|
| Estado | `EM ANDAMENTO` |
| Owners principais | CLI, BrowserHost e ElectronHost |
| Dependência | Fase 1 |
| ADR de base | [ADR 0013](docs/adr/0013-development-runner-cache-and-lifecycle.md) |

### Objetivo

Fazer da CLI a interface operacional oficial entre IA, engine, hosts e toolchain.

### Entregue

- `game doctor`, `context`, `status`, `inspect`, `new`, `validate` e `test`;
- `game simulate`, `capture`, `replay` e `report` com implementações reais no adapter disponível;
- `game run`, `build` e `package` para os targets experimentais suportados;
- BrowserHost iniciado pela CLI com WASM e bundle Vite;
- ElectronHost com bundle local, lifecycle, storage e adapters Steam opcionais;
- saída JSON estruturada com `runId`, status, diagnósticos, artefatos e próximas ações;
- build WebAssembly e pacotes TypeScript reproduzíveis por lockfiles.

### Falta

- cache incremental por famílias de artefato e invalidação explicável;
- watch mode com rebuild limitado ao módulo afetado;
- hardening do lifecycle de processos em todos os hosts;
- comandos futuros apenas quando sua capability proprietária existir; não serão criados stubs de `world`, `physics`, `network` ou `construction`.

Smoke tests distribuíveis, assinatura e notarização pertencem ao hardening de targets da Fase 11; não bloqueiam o Development Runner local.

### Gate de saída

Uma sessão executa, interrompe, reconstrói e inspeciona um projeto com comandos reproduzíveis; caches declaram causa de hit/miss; processos não ficam órfãos; cada target alegado possui execução no sistema correspondente.

## 7. Fase 3 — AI Control Plane e observabilidade causal

| Campo | Valor |
|---|---|
| Estado | `EM ANDAMENTO` |
| Owners principais | CLI, control protocol, harness e BrowserHost |
| Backlog ativo | `ENG-017` → `ENG-018`; depois retorno aos gaps `ENG-019`–`ENG-020` da Fase 2 |
| ADR de base | [ADR 0010](docs/adr/0010-local-control-protocol-and-scenario-harness.md), [ADR 0014](docs/adr/0014-declarative-ui-contracts-and-initial-renderer.md) e [ADR 0015](docs/adr/0015-raster-capture-and-visual-baselines.md) |

### Objetivo

Permitir que a IA controle uma execução real, veja o que ocorreu e rastreie um defeito do input até a apresentação.

### Entregue

- protocolo local versionado, fechado e transportado por stdio;
- token efêmero, timeout, processo filho e shutdown pertencentes à CLI;
- `health`, `load_scenario`, `act`, `wait_for`, `inspect`, `capture`, `metrics`, `verify_replay` e `shutdown`;
- snapshots lógicos, hash, replay, métricas e timeline causal mínima;
- scenario harness com assertions fechadas por schema;
- artifact bundle e captura SVG semântica no adapter headless/WASM;
- sessão fria automatizada sobre o starter;
- bloqueio de `eval`, shell, script arbitrário, filesystem irrestrito e proxy de rede.

### Falta agora

1. `ENG-017` — `UiViewModel` e `RenderedUiSnapshot` produzidos pelo BrowserHost real;
2. `ENG-018` — captura raster real vinculada ao run e cenário visual reproduzível;
3. correlação BrowserHost entre input, tick, estado, projector, DOM/Three.js e frame capturado;
4. inspeção de bounds, clipping, foco, texto resolvido, acessibilidade e ações disponíveis;
5. captura de erros do renderer, assets, shaders, áudio e lifecycle no mesmo run;
6. vídeo e profiling somente quando houver contrato e consumidor material.

### Correlação mínima

Todo registro usa `runId`, tick e sequência. IDs de entidade, visual, chunk, job, construção ou conexão aparecem apenas quando causalmente aplicáveis.

### Gate de saída

Ao observar um defeito nos pixels do BrowserHost, a IA consegue relacioná-lo ao estado lógico, ação, evento, projector e origem aplicáveis, reproduzi-lo por cenário e anexar evidência real ao artifact bundle.

## 8. Fase 4 — Autoria text-first de gameplay, UI e conteúdo

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners principais | kernel, Lua SDK, schemas, content compiler e presentation protocol |
| Dependência | Fase 3 |
| ADR de base | [ADR 0004](docs/adr/0004-lua-sandbox.md), [ADR 0016](docs/adr/0016-public-lua-sdk-layers-and-escape-hatches.md), [ADR 0017](docs/adr/0017-content-pack-compilation-and-migrations.md) e [ADR 0018](docs/adr/0018-numeric-determinism-and-rng-streams.md) |

### Objetivo

Permitir que a maior parte de um jogo seja criada por Lua, JSONC, CSS e TypeScript públicos, sem alterar internals da engine.

### Entregue

- Lua 5.4.8 sandboxed com tempo e RNG lógicos;
- command buffer, estado inteiro inspecionável e fixed ticks;
- JSON Schema e validação semântica do manifest e conteúdo atual;
- gameplay, conteúdo e apresentação separados por boundaries;
- content binding experimental comum ao BrowserHost e ao worker;
- protocolo de apresentação e eventos semânticos de áudio/efeito;
- saves e replays cobrindo o estado autoritativo atual.

### Falta

- SDK Lua público declarado e versionado com acesso por símbolo, queries, timers lógicos, streams de RNG e comandos, sem expor internals. Entidades, componentes, tags, relações e recursos são a camada 2 do [ADR 0016](docs/adr/0016-public-lua-sdk-layers-and-escape-hatches.md) e pertencem à fase do consumidor que os exigir;
- compilador de content pack versionado, com mapa de símbolos e origem para diagnóstico;
- UI declarativa baseada em `UiViewModel`, intents e schemas;
- estilos CSS registrados como apresentação, não como contrato público;
- projectors read-only declarados e medidos separadamente;
- localização, navegação, foco, touch targets e breakpoints validados;
- escape hatches graduais: JSONC → capability → Lua/projector → TypeScript → extensão nativa aprovada;
- migrations de schema e conteúdo compilado regenerável.

### Restrições

Lua não acessa renderer, DOM, host, filesystem, rede, relógio civil ou SDKs de plataforma. TypeScript de apresentação não decide gameplay. JSONC validado não executa expressões Lua ou JavaScript.

### Gate de saída

Uma sessão nova cria regras, conteúdo, tela, apresentação e cenário usando apenas APIs públicas; valida, executa e inspeciona o resultado sem tocar no kernel ou nos internals dos hosts.

## 9. Fase 5 — Runtime espacial e mundo procedural

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Owners previstos | spatial runtime, world runtime e job system |
| Dependência | Fase 4 |
| ADR de base | [ADR 0018](docs/adr/0018-numeric-determinism-and-rng-streams.md) e [ADR 0019](docs/adr/0019-spatial-model-chunk-lifecycle-and-job-commit.md) |

### Objetivo

Criar uma fundação opt-in comum para mapas pequenos, mundos extensos e sandboxes virtualmente infinitos.

### Entregas técnicas

- posição global composta por dimensão, região, chunk e posição local;
- conversões e precisão testadas sem expor a estrutura interna como API permanente;
- chunks com coordenada, seed derivada, generator version, base, deltas, entidades, collider, mesh, LOD, hash e persistência;
- lifecycle explícito: `UNLOADED`, `REQUESTED`, `GENERATING`, `READY_FOR_MESH`, `MESHING`, `RESIDENT`, `DIRTY`, `SAVING`, `EVICTABLE`;
- jobs assíncronos de geração, meshing, pathfinding, compressão e I/O;
- commit de resultados de jobs em boundary determinístico, independente da ordem de conclusão;
- spatial partitioning interno substituível: grid, sparse grid, quadtree, octree, BVH ou region index;
- Procedural World Graph por seed, generator ID/version, dimensão, coordenada e content hash;
- World Simulation LOD: ativo, simplificado, agregado e não carregado;
- catch-up por tempo lógico e regras agregadas;
- floating origin quando o teste de precisão justificar;
- inspeção de regiões, chunks, jobs, cache, hashes, geração, meshing e descarte.

### Cenários e diagnósticos mínimos

- viagem longa com memória estabilizada;
- teleport entre regiões;
- ordem de jobs permutada com mesmo hash lógico;
- seam entre chunks;
- chunk descartado sem recursos residentes;
- `WORLD_GENERATOR_NON_DETERMINISTIC`, `WORLD_CHUNK_HASH_MISMATCH`, `WORLD_CHUNK_LEAK`, `WORLD_SEAM_DETECTED` e `WORLD_JOB_BLOCKED_TICK`.

### Gate de saída

O runtime gera, carrega, descarta e regenera chunks determinísticos; viagens longas estabilizam memória; jogos que não declaram a capability não carregam seu custo relevante.

## 10. Fase 6 — Motion, física e Mass Simulation

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Owners previstos | motion, physics adapters e mass runtime |
| Dependência | Fase 5 |
| ADR de base | [ADR 0021](docs/adr/0021-motion-and-physics-adapter-authority.md), [ADR 0022](docs/adr/0022-mass-runtime-storage-levels-and-budgets.md) e [ADR 0020](docs/adr/0020-presentation-buffers-and-wasm-memory.md) |

### Objetivo

Fornecer movimento sem solver, integração física substituível e simulação de populações em níveis de detalhe.

### Motion System

- `motion.tween`, `spring`, `path`, `ballistic`, `snap`, `follow` e `orbit`;
- tempo lógico ou de apresentação declarado por operação;
- cancelamento, conclusão, interrupção e causa inspecionáveis;
- motion visual sem autoridade sobre a regra.

### Física por adapters

- contratos semânticos para corpos, colliders, contatos, triggers, joints, raycasts e constraints;
- autoridade explícita: `presentation`, `gameplay` ou `host`;
- solvers 2D e 3D avaliados por licença, targets, estabilidade e observabilidade;
- caixas, círculos/esferas, cápsulas, convex hulls e meshes estáticos conforme o adapter;
- character controllers, ragdolls, grabs e breakables somente após os fundamentos;
- snapshots de corpos, contatos, forças, velocidades, sleeping e divergência;
- nenhuma promessa de determinismo competitivo cross-platform sem prova específica.

### Mass Runtime

- armazenamento SoA/contíguo para dados massivos;
- spatial hashing e queries limitadas;
- movimento, steering, separação, dano em área e despawn em lote;
- Lua configura comportamento e recebe eventos agregados, sem callback completo por agente por frame;
- níveis: entidade completa, agente simplificado, grupo agregado, instância visual e densidade/partícula;
- promoção e rebaixamento observáveis e dentro de budget;
- damage fields com shape, intervalo e efeito declarativos.

### Gates e diagnósticos

- cenários de movimento bloqueado, tunneling, autoridade divergente e horda excedendo budget;
- `PHYSICS_AUTHORITY_MISMATCH`, `PHYSICS_COLLIDER_INVALID`, `PHYSICS_DIVERGENCE`;
- `MASS_ENTITY_BUDGET_EXCEEDED`, `MASS_LUA_PER_ENTITY_CALLBACK`, `MASS_SPATIAL_QUERY_TOO_BROAD`, `MASS_PROMOTION_SPIKE`.

### Gate de saída

A IA explica por que uma entidade não se moveu, um corpo atravessou um collider ou uma população excedeu budget; a simulação massiva permanece separada de sua projeção visual.

## 11. Fase 7 — Persistência, replays e multiplayer player-hosted

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners principais | kernel, storage e network runtime futuro |
| Dependências | Fases 5 e 6 |
| ADR de base | [ADR 0023](docs/adr/0023-world-persistence-and-region-storage.md) e [ADR 0024](docs/adr/0024-player-hosted-multiplayer-and-protocol-compatibility.md) |

### Já entregue

- saves lógicos versionados com envelope, checksum e content hash;
- migrations e fixtures básicas;
- replays com inputs, checkpoints e hashes;
- equivalência lógica native/WASM e localização de divergência no corpus atual;
- storage/lifecycle experimental no ElectronHost.

### Persistência mundial restante

- seed, generator version, deltas, entidades persistentes, resumos regionais, Construction Graphs e terrain edits;
- region storage com escrita atômica, journal, checksums, compactação e recuperação após crash;
- inspeção, compactação e migration por CLI;
- crescimento de save e compatibilidade entre versões medidos;
- o mundo base regenerável não será duplicado integralmente no save.

### Multiplayer restante

- salas player-hosted e host-authoritative;
- protocolo lógico de input, snapshot, correção e interesse;
- transporte local primeiro; WebRTC, Steam Networking, P2P de plataforma e UDP somente por adapters aprovados;
- relay apenas como fallback de transporte, nunca servidor de gameplay;
- sincronização procedural por seed, generator version, content hash, chunk hashes e deltas;
- late join, reconexão e host migration;
- snapshots de sala, jogadores, latência, perda, correções, interesse e migração;
- limite explícito para co-op, partidas casuais e sandboxes entre amigos.

### Diagnósticos mínimos

- `NETWORK_WORLD_HASH_MISMATCH`, `NETWORK_CHUNK_DELTA_BACKLOG`, `ROOM_PHYSICS_DIVERGENCE`, `HOST_MIGRATION_FAILED`;
- cenário que encontre o primeiro tick, evento ou chunk divergente entre host e cliente.

### Gate de saída

Save local e mundial sobrevivem a crash e migration; replay encontra a primeira divergência; uma sala casual suporta conexão, late join, reconexão e migração dentro dos limites declarados.

## 12. Fase 8 — Renderer, UI, áudio e apresentação escalável

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners principais | presentation protocol, renderer-three, UI renderer e hosts |
| Dependências | Fases 3, 4, 5, 6 e 7 |
| ADR de base | [ADR 0020](docs/adr/0020-presentation-buffers-and-wasm-memory.md), [ADR 0014](docs/adr/0014-declarative-ui-contracts-and-initial-renderer.md), [ADR 0015](docs/adr/0015-raster-capture-and-visual-baselines.md) e [ADR 0025](docs/adr/0025-audio-backends-voice-budgets-and-fallback.md) |

### Já entregue

- protocolo semântico de apresentação;
- renderer Three.js experimental para browser/Electron;
- primitivas 3D, câmera, atmosfera e transformações;
- Web Audio por IDs semânticos, buses básicos e eventos;
- partículas em burst com budget simples;
- separação entre estado lógico e representação visual.

### Renderer escalável restante

- buffers contíguos entre simulação, projector e GPU;
- sprites e quads instanciados, atlases e sorting controlado;
- instanced meshes, materiais compartilhados, LOD e impostors;
- culling por célula/lote e pooling;
- terrain streaming para tiles, voxel e heightfield conforme capability declarada;
- greedy meshing e rebuild parcial para voxel;
- GPU particles com fallback CPU limitado;
- degradação automática de resolução, sombras, partículas, animação e pós-processamento sem alterar gameplay;
- snapshots de scene graph, visibilidade, culling, LOD, draw calls, triângulos, memória e shaders.

### UI restante

- `UiViewModel` como intenção e `RenderedUiSnapshot` como resultado real;
- renderer declarativo acessível;
- bounds, clipping, foco, contraste, texto resolvido, locale e ações;
- navegação completa por teclado, controle e touch;
- transições UI–mundo sem duplicar estado autoritativo;
- baselines raster por backend, perfil e viewport.

### Áudio restante

- prioridade, deduplicação, spatial intent e música adaptativa;
- budgets de vozes e memória;
- captura de waveform/espectro e eventos não resolvidos;
- fallback observável para backend indisponível.

### Gate de saída

A IA diferencia objeto inexistente, fora da câmera, cullado, transparente, asset ausente, shader/material inválido e erro lógico; apresentação massiva permanece dentro dos budgets aprovados.

## 13. Fase 9 — Procedural Construction Runtime

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Owners previstos | construction runtime, geometry compiler e authoring toolkit |
| Dependências | Fases 5, 6 e 8 |
| ADR de base | [ADR 0026](docs/adr/0026-construction-graph-as-source-of-truth.md) |

### Objetivo

Permitir construção procedural interativa cuja fonte de verdade seja um grafo semântico, nunca a mesh derivada.

### Entregas técnicas

- `Construction Graph` versionado com volumes, footprints, paredes, pisos, telhados, aberturas, caminhos, cercas, escadas, fundações, decoração e constraints;
- comandos semânticos de edição com IDs estáveis, undo/redo e replay;
- Building Chemistry para encontros, cruzamentos, fundações, portas, arcos, quinas e decoração contextual;
- constraint solver especializado para espaçamento, alinhamento, continuidade, suporte, interseções e prioridades;
- Geometry Compiler incremental com extrusão, offset, triangulação, booleanas controladas, telhados, UV procedural e cache por hash;
- rebuild apenas da região e das dependências afetadas;
- terrain sculpting: raise, lower, smooth, flatten, paint, path e water;
- picking, hover, drag, handles, gizmos, brushes, splines e snapping semântico;
- decoração instanciada com seeds locais, máscaras, exclusão, budgets e LOD;
- rastreabilidade de mesh, collider e decoração até construction, node, rule, asset, região e comando.

### Diagnósticos mínimos

- footprint inválido, self-intersection, wall gap, boolean failure, roof unresolved, constraint conflict e rebuild acima do budget;
- interseção com terreno, caminho íngreme, fundação sem suporte e decoração flutuante/densa.

### Gate de saída

Mover uma parede reconstrói apenas a região necessária; undo/redo e replay reproduzem o mesmo grafo; a IA explica cada consequência derivada.

## 14. Fase 10 — Procedural Forges

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Owners previstos | ferramentas independentes de authoring/build time |
| Dependências | Fases 4–9 conforme o Forge |
| ADR de base | [ADR 0027](docs/adr/0027-forge-output-contract-and-authoring-boundary.md) |

### Contrato comum

Todo Forge recebe spec textual e produz:

- receita e seed quando aplicável;
- arquivos convencionais;
- manifest, hashes, toolchain e parâmetros;
- origem e licença;
- preview;
- métricas, diagnósticos e validation report;
- instrução de regeneração quando possível.

Nenhum Forge entrega apenas arquivo opaco. Serviços externos podem ser adapters de authoring, mas não serão obrigatórios para executar o jogo.

### Visual Forge

- sprites, low-poly, materiais, texturas, rig, animações, colliders, LOD e impostors;
- skeleton-first e personagens modulares quando aplicável;
- previews, thumbnails e turntable;
- geração ocorre em authoring/build time.

### World Forge

- terrenos, biomas, cavernas, rios, ilhas, vegetação, recursos, estruturas, clima e distribuição;
- valida seams, rios interrompidos, estruturas flutuantes, recursos inacessíveis, densidade, variedade e budget.

### Construction Forge

- estilos arquitetônicos, paredes, telhados, aberturas, escadas, arcos, fundações, regras de união, decoração, constraints e presets de ferramentas.

### Physics Forge

- colliders, massa, centro de massa, joints, ragdolls, grab points, breakables, weapon profiles e cenários de estabilidade.

### Audio Forge

- `MusicSpec`, `SfxSpec`, instrumentos, osciladores, ruído, envelopes, filtros, sequenciador, buses e automação;
- música adaptativa, estados, transições, stingers, SFX, ambiência, loops e stems;
- valida duração, BPM, tonalidade estimada, LUFS, peak, clipping, dinâmica, espectro e continuidade de loop;
- renderer local sem serviço externo obrigatório.

### Gate de saída

Os cinco Forges produzem artefatos rastreáveis usados nas fixtures e preparados para os jogos finais, com previews e relatórios verificáveis.

## 15. Fase 11 — Diagnose, Repair, Verify e performance gates

| Campo | Valor |
|---|---|
| Estado | `PARCIAL` |
| Owners principais | CLI, harness, diagnósticos e benchmark registry |
| Dependência | Gates de observabilidade das fases anteriores |
| ADR de base | [ADR 0028](docs/adr/0028-diagnose-repair-verify-and-repair-classes.md), [ADR 0029](docs/adr/0029-benchmark-registry-profiles-and-baselines.md), [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md) e [ADR 0031](docs/adr/0031-native-diagnostic-host-trigger-and-criteria.md) |

### Já entregue

- diagnósticos estruturados com códigos estáveis em validação e runtime atual;
- artifact manifests e relatórios por run;
- replay, hashes e timeline mínima;
- cenários, sessão fria e CI native/WASM;
- algumas classificações explícitas de `NOT_AVAILABLE`, `NOT_RUN` e limitações.

### Falta

- fluxo `detectar → reproduzir → minimizar → rastrear → formular hipótese → dry-run → aplicar → regressão → comparar evidências`;
- `game diagnose`, `explain`, `fix --dry-run`, `fix --apply` e `verify` somente com operações reais e schemas fechados;
- classificação de reparo: `automatic-safe`, `automatic-with-review`, `suggestion-only`, `human-required`;
- nenhum patch automático para decisão artística, segredo, assinatura, publicação, exclusão de dados ou decisão comercial;
- registry de métricas e performance profiles por target;
- benchmarks oficiais para cards, hordas, partículas, física, chunks, mundo, construção e multiplayer quando as capabilities existirem;
- baselines aprovadas atualizadas somente por diff intencional;
- profiles com hardware, OS, target, backend, resolução, warm-up, amostras, P50/P95/P99, variância e budget;
- hardening dos targets browser, desktop, Android e iOS conforme o escopo de release;
- SBOM, provenance, licença e smoke instalado para distribuição.

### Gate de saída

A IA não relata apenas “FPS baixo” ou “falhou”: identifica sistema, archetype, chunk, batch, asset, construção, transporte ou efeito responsável; qualquer reparo aplicado possui cenário de regressão e comparação de evidências.

## 16. Fase 12 — Cinco jogos de prova e sessões frias

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Dependência | Fases 1–11 |
| ADR de base | [ADR 0008](docs/adr/0008-mandatory-scale-and-procedural-capabilities.md) e [ADR 0012](docs/adr/0012-feature-first-roadmap-and-proof-games.md) |
| Regra | jogos validam integração; não são proprietários das fundações |

### Situação atual

`examples/card-roguelite` existe como fixture antecipada. Ele comprova parte de gameplay, conteúdo, save e replay, mas não passou o gate de jogo final porque UI real, captura raster e demais critérios integrados ainda faltam.

Nenhum dos cinco jogos está marcado como concluído.

### Jogo A — Card roguelite

Comprova determinismo, conteúdo text-first, UI declarativa, saves, replays, motion visual, áudio, captura real, build e operação por sessão fria.

### Jogo B — Survivor-like

Comprova spatial grid, Mass Runtime, damage fields, níveis de simulação, instancing, partículas e performance profiles. A meta é gameplay completo onde importa e percepção de horda massiva, não um milhão de agentes completos.

### Jogo C — Physics party brawler

Comprova física 3D, ragdolls, grabs, breakables, multiplayer player-hosted, snapshots, reconexão, host migration e diagnóstico de divergência.

### Jogo D — Procedural indie sandbox

Comprova chunks, streaming, geração, jobs, persistência por deltas, region storage, floating origin, simulation LOD e sincronização procedural. O MVP permanece estilizado, limitado e mensurável.

### Jogo E — Procedural diorama builder

Comprova Construction Graph, splines, Building Chemistry, constraints, geometry compiler incremental, terrain sculpting, runtime authoring, decoração e causal trace.

### Sessão fria obrigatória por jogo

Uma IA sem memória anterior deverá:

1. ler o estado canônico;
2. descobrir capabilities e limitações;
3. localizar contratos, conteúdo e cenários;
4. implementar uma alteração limitada;
5. executar e controlar o runtime;
6. observar lógica, UI e pixels;
7. diagnosticar e corrigir um defeito reproduzível;
8. verificar replay, regressão e performance aplicável;
9. produzir build e artifact bundle;
10. deixar o próximo passo para outra sessão.

### Gate de saída

Os cinco jogos passam pelos gates funcionais, visuais, de target e performance aplicáveis usando releases compatíveis da engine. Só então o roadmap completo recebe `PASS`.

## 17. Target matrix

| Target | Estado atual | Para alegar suporte |
|---|---|---|
| Native headless | experimental e executado em CI | equivalência e corpus de replays continuam verdes |
| Browser | experimental | Control Plane real, captura raster, budgets e fallback gráfico |
| Electron/macOS | experimental | pacote instalado, smoke, lifecycle e política de assinatura |
| Electron/Windows | `NOT_RUN` como pacote distribuível | build e smoke em runner Windows |
| Electron/Linux | `NOT_RUN` como pacote distribuível | build e smoke em runner Linux |
| Android | `NOT_AVAILABLE` | host, lifecycle, touch, persistência e dispositivo real |
| iOS | `NOT_AVAILABLE` | host, lifecycle, touch, persistência e dispositivo real |
| Consoles | rota futura | acesso oficial, infraestrutura privada e host/renderer nativos |

Publicação, assinatura, notarização, compra e envio a lojas nunca são autorizados por este roadmap.

## 18. Definition of Done de uma capability

Uma capability só deixa de ser experimental quando os itens aplicáveis respondem `PASS`:

```text
Discover
Author
Execute
Observe
Diagnose
Repair
Verify
Continue
```

Checklist obrigatório:

- owner, versão, targets e limites;
- schema ou contrato público;
- fixture e exemplo;
- comandos de execução e inspeção;
- snapshots, métricas e traces aplicáveis;
- diagnósticos estáveis;
- cenário funcional;
- artifact bundle;
- performance gate quando necessário;
- documentação para sessão fria;
- integração no jogo de prova aplicável antes de estabilidade.

`NOT_RUN`, `NOT_AVAILABLE` e `INCONCLUSIVE` nunca equivalem a `PASS`.

## 19. Garantias transversais

- nenhuma autoridade de gameplay, save, replay, física, mundo, construção ou rede fica invisível;
- nenhuma capability é entregue sem controle, inspeção, diagnóstico e cenário proporcionais;
- autoria permanece textual; binários gerados possuem manifest, hash, origem, licença e receita quando possível;
- jobs assíncronos não alteram a ordem lógica por tempo de conclusão;
- apresentação derivada não decide silenciosamente o estado autoritativo;
- otimizações não usadas por um projeto não impõem seu custo relevante;
- escala nunca é alegada sem cenário, hardware, target, perfil e métricas;
- reparo nunca é declarado concluído sem regressão;
- quando faltar evidência, o resultado correto é `INCONCLUSIVE` com investigação seguinte.

## 20. Próxima sequência executável

```text
ENG-017  BrowserHost UiViewModel + RenderedUiSnapshot reais
    ↓
ENG-018  captura raster + cenário visual + artifact bundle
    ↓
ENG-019  cache/watch incremental e invalidação explicável
    ↓
ENG-020  lifecycle e encerramento limpo do Development Runner
    ↓
fechar gates P0 das Fases 2–3
    ↓
detalhar e concluir a Fase 4 antes do runtime espacial
```

O card roguelite continuará como fixture para `ENG-017` e `ENG-018`. Depois disso, o trabalho retorna às fundações técnicas; não será iniciado outro jogo completo antes da Fase 12.

## 21. Regra de evolução

Cada revisão deve atualizar, no mesmo change set:

- estado da fase e evidência que passou seu gate;
- backlog do marco ativo;
- capabilities e limitações afetadas;
- ADR quando ordem, boundary, schema, protocolo ou dependência durável mudar;
- target matrix quando houver execução material nova.

As capacidades obrigatórias do [ADR 0008](docs/adr/0008-mandatory-scale-and-procedural-capabilities.md) não podem ser removidas por repriorização. O [ADR 0012](docs/adr/0012-feature-first-roadmap-and-proof-games.md) exige que elas sejam construídas como fundações técnicas e comprovadas em conjunto pelos jogos finais.
