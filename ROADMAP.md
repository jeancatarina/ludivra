# Roadmap da Ludivra

> Plano de execução da engine: situação atual, sequência obrigatória, entregas restantes e critérios de promoção.

| Campo | Valor |
|---|---|
| Versão do roadmap | 2.0 |
| Data-base | 2026-07-22 |
| Release atual | 0.7.0 |
| Fase atual | Fase 2 — Primeiro jogo real e loop visual completo |
| Próxima entrega | `ENG-017` — `UiViewModel` e `RenderedUiSnapshot` reais no BrowserHost |
| Estado geral | 2 fases concluídas, 1 em andamento e 7 planejadas |

## 1. Leitura rápida

A Ludivra está construindo primeiro a capacidade de uma IA **descobrir, executar, observar e verificar** um jogo; depois amplia a engine com distribuição, escala, mundo procedural, física, multiplayer, construção e Forges.

O trabalho atual ainda não é a validação final do portfólio. O card roguelite existente é o primeiro consumidor real da engine e está incompleto como prova visual: o loop lógico foi entregue, mas a UI semântica real do BrowserHost e a captura raster ainda faltam.

```text
CONCLUÍDO                         AGORA                         DEPOIS

Fase 0 ─ Fundação 0.5.0     ┐
                            ├─> Fase 2 ─ Card roguelite ─> Desktop ─> Mobile
Fase 1 ─ Harness 0.6.0      ┘          ENG-017 agora                    │
                                                                         ▼
Survivor-like ─> Sandbox procedural ─> Brawler ─> Diorama ─> Forges finais
```

O roadmap completo termina somente quando os cinco jogos de prova e todas as capacidades obrigatórias passarem por seus gates. Um jogo aparecer antes da última fase porque é usado para desenvolver e validar a capacidade correspondente; isso não significa que o portfólio final esteja concluído.

## 2. Como interpretar este documento

### 2.1 Estados

| Estado | Significado |
|---|---|
| `CONCLUÍDA` | O gate da fase passou e há evidência correspondente |
| `EM ANDAMENTO` | A fase possui entregas concluídas, mas seu gate ainda não passou |
| `PLANEJADA` | A fase é obrigatória, porém ainda não é o marco ativo |
| `ROTA FUTURA` | É desejável, mas não faz parte da conclusão do roadmap atual |

Para capacidades e verificações, permanecem válidos `PASS`, `FAIL`, `NOT_RUN`, `NOT_AVAILABLE`, `NOT_APPLICABLE` e `INCONCLUSIVE`. Somente `PASS` comprova uma alegação.

### 2.2 Níveis de planejamento

| Nível | Função | Fonte canônica |
|---|---|---|
| Arquitetura | Define premissa, fronteiras e critérios globais | [architecture.md](architecture.md) |
| ADR | Registra uma decisão durável aprovada | [docs/adr](docs/adr) |
| Roadmap | Ordena fases, dependências e gates | este documento |
| Backlog | Lista o trabalho executável do marco ativo | [BACKLOG.md](BACKLOG.md) |
| Estado e evidência | Registra o que realmente foi executado | `.ludivra/project-state.json` e `reports/runs/` |

O roadmap não substitui schemas, protocolos ou guardrails. Mudanças públicas, dependências de runtime e decisões difíceis de reverter continuam exigindo o processo definido em [AGENTS.md](AGENTS.md).

### 2.3 Termos usados no roadmap

| Termo | Significado neste documento |
|---|---|
| Gate | conjunto de condições que precisa passar antes de encerrar uma fase |
| Capability | capacidade modular da engine, ativada somente pelos projetos que a declaram |
| Jogo de prova | jogo real usado para desenvolver e comprovar uma ou mais capacidades |
| Vertical slice | fluxo jogável com começo, loop, fim, controles, feedback e evidência |
| Sessão fria | nova sessão de IA, sem memória anterior, trabalhando apenas pelo repositório |
| Host | aplicação que executa o runtime em browser, desktop, mobile ou modo headless |

## 3. Painel de progresso

| Fase | Marco | Estado | Entregue | Falta para o gate |
|---|---|---|---|---|
| 0 | Fundação verificável | `CONCLUÍDA` em 0.5.0 | estado canônico, capabilities, manifests, fitness functions e CI | — |
| 1 | Operabilidade por chat | `CONCLUÍDA` em 0.6.0 | control protocol, harness, replay, captura semântica e sessão fria | — |
| 2 | Card roguelite e loop visual | `EM ANDAMENTO` em 0.7.0 | `ENG-016`: loop lógico e cenários | `ENG-017` e `ENG-018` |
| 3 | Desktop comercial e Steam | `PLANEJADA` | ElectronHost e package experimental | validação nativa, smoke instalado e supply chain |
| 4 | Mobile | `PLANEJADA` | contratos portáveis existentes | hosts Android/iOS e dispositivos reais |
| 5 | Survivor-like e Mass Runtime | `PLANEJADA` | — | segundo jogo, escala e reuso comprovados |
| 6 | Sandbox e mundo procedural | `PLANEJADA` | — | runtime espacial, chunks, streaming e persistência mundial |
| 7 | Brawler, física e multiplayer | `PLANEJADA` | — | adapters físicos e salas player-hosted |
| 8 | Diorama e construção procedural | `PLANEJADA` | — | grafo, geometria incremental e autoria em runtime |
| 9 | Forges obrigatórios | `PLANEJADA` | recursos locais de áudio/asset ainda não constituem Forges completos | cinco Forges usados e validados |

### 3.1 Backlog conhecido

O backlog possui 18 itens identificados: 14 concluídos e 4 planejados.

| Grupo | Itens |
|---|---|
| Concluídos | `ENG-001`–`ENG-008`, `ENG-010`–`ENG-012`, `ENG-014`–`ENG-016` |
| Marco atual | `ENG-017`, depois `ENG-018` |
| Marco desktop posterior | `ENG-009` e `ENG-013` |

Detalhes, prioridades e descrições ficam somente em [BACKLOG.md](BACKLOG.md), evitando uma segunda lista executável neste arquivo.

## 4. Caminho crítico

Cada fase depende do gate da fase anterior. Trabalho exploratório pode ocorrer para reduzir risco, mas não promove a fase nem permite pular o gate.

```text
F0 Fundação
   ↓
F1 Harness e observabilidade
   ↓
F2 Primeiro jogo e prova visual
   ↓
F3 Desktop comercial
   ↓
F4 Mobile
   ↓
F5 Segundo jogo e Mass Runtime
   ↓
F6 Mundo procedural
   ↓
F7 Física e multiplayer
   ↓
F8 Construção procedural
   ↓
F9 Consolidação dos cinco Forges
   ↓
ROADMAP COMPLETO: cinco jogos + capacidades obrigatórias + sessão fria
```

## 5. Marco atual — Fase 2

### Fase 2 — Primeiro jogo real e loop visual completo

| Campo | Valor |
|---|---|
| Estado | `EM ANDAMENTO` |
| Release parcial | 0.7.0 |
| Consumidor | `examples/card-roguelite` |
| Dependências | Fases 0 e 1 concluídas |
| Próximo item | `ENG-017` |

**Objetivo:** entregar um card roguelite pequeno, completo e modificável por uma sessão nova, sem extrair antecipadamente um framework genérico de cartas.

**Já foi feito — `ENG-016`:**

- começo, dois encontros, recompensa, vitória, derrota e reinício;
- gameplay determinístico em Lua;
- custos, efeitos e encontros em JSONC validado;
- IDs numéricos de ação e estado pertencentes apenas ao manifest;
- mesmo chunk de gameplay no BrowserHost e no control worker;
- cenários de vitória, derrota e energia/bloqueio;
- replay e equivalência lógica aplicáveis;
- apresentação Three.js mínima compilável.

**Ainda falta:**

1. `ENG-017` — produzir `UiViewModel` e `RenderedUiSnapshot` a partir do BrowserHost real;
2. `ENG-018` — produzir captura raster vinculada ao run e um cenário visual reproduzível;
3. comprovar UI legível, acessível e navegável, não apenas controles HTML e primitivas gráficas;
4. executar o gate completo do vertical slice e registrar suas limitações.

**Gate de saída:** uma sessão fria modifica o jogo, executa o loop completo, inspeciona estado lógico e UI renderizada, produz screenshots reais e replay, e entrega build reproduzível. O loop lógico isolado e a captura SVG headless não satisfazem esse gate.

## 6. Fases concluídas

### Fase 0 — Fundação verificável

| Campo | Valor |
|---|---|
| Estado | `CONCLUÍDA` |
| Release | 0.5.0 |

**Objetivo:** tornar o estado da engine descobrível e verificável sem relato manual.

**Entregue:**

- kernel C++20, Lua sandbox, runner nativo e WebAssembly;
- equivalência lógica native/WASM;
- schemas, saves e replays versionados;
- CLI estruturada e catálogo gerado de capabilities;
- `.ludivra/project-state.json` como índice canônico regenerável;
- artifact manifests com commit, dirty state, versões e hashes;
- fitness functions de packages, imports, CMake e arquivos gerados;
- CI com matriz nativa e gate WebAssembly.

**Gate comprovado:** uma sessão nova consegue identificar o que existe, qual maturidade foi declarada e quais evidências ainda correspondem ao commit atual.

### Fase 1 — Harness e operabilidade por chat

| Campo | Valor |
|---|---|
| Estado | `CONCLUÍDA` no escopo aprovado |
| Release | 0.6.0 |
| ADR principal | [ADR 0010](docs/adr/0010-local-control-protocol-and-scenario-harness.md) |

**Objetivo:** fechar o ciclo `executar → controlar → observar → diagnosticar → verificar` antes de ampliar o domínio da engine.

**Entregue:**

- control protocol local por stdio com token efêmero e lifecycle pertencente à CLI;
- operações fechadas de health, cenário, ação, espera, inspeção, captura, métricas, replay e shutdown;
- `game context`, `simulate`, `capture`, `replay`, `report` e `run --control`;
- scenario harness com assertions fechadas;
- timeline causal mínima;
- captura SVG e snapshots semânticos do adapter headless;
- artifact bundle, replay e sessão fria automatizada do starter.

**Limite aprovado:** pixels e snapshots reais do BrowserHost pertencem à Fase 2. A captura semântica headless não é evidência de renderização raster.

## 7. Fases planejadas

### Fase 3 — Desktop comercial e Steam

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Depende de | Fase 2 |
| Backlog já aberto | `ENG-009`, `ENG-013` |

**Objetivo:** promover o ElectronHost experimental a caminho distribuível e verificável.

**Entregas obrigatórias:**

- bundle empacotado sem servidor de desenvolvimento;
- smoke test do aplicativo empacotado/instalado;
- pacotes macOS, Windows e Linux validados nos sistemas correspondentes;
- lifecycle, storage e crash report com políticas explícitas;
- adapters Steam opcionais por contratos de plataforma;
- SBOM, provenance, hashes e verificação de licenças;
- receitas separadas para assinatura, notarização e SteamPipe.

**Gate de saída:** cada target declarado possui pacote e smoke test executado no sistema correspondente. Assinatura, notarização e publicação continuam dependentes de autorização e credenciais do usuário.

### Fase 4 — Mobile

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Depende de | Fase 3 |

**Objetivo:** provar que kernel, protocolos e host permanecem separados em Android e iOS.

**Entregas obrigatórias:**

- hosts Capacitor para Android e iOS;
- touch, safe areas, orientação e layout adaptativo;
- pause/resume, background, pressão de memória e perda de contexto;
- checkpoint atômico durante lifecycle;
- adapters opcionais de haptics, identidade, commerce e cloud;
- perfis e testes em dispositivos reais de referência.

**Gate de saída:** o card roguelite executa, persiste, suspende e retoma em Android e iOS dentro de budgets medidos.

### Fase 5 — Survivor-like, Mass Runtime e reuso

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Depende de | Fase 4 |
| Jogo de prova | Survivor-like |

**Objetivo:** entregar o segundo jogo, comprovar reutilização e sustentar populações grandes por dados e apresentação em lote.

**Entregas obrigatórias:**

- spatial grid e queries com escopo explícito;
- armazenamento contíguo quando profiling justificar;
- agentes completos, simplificados e agregados;
- damage fields e comandos em lote;
- instancing, batching, pooling e budgets;
- degradação exclusivamente visual;
- benchmarks 2D e 3D em hardware de referência.

**Gate de saída:** card roguelite e survivor-like usam a mesma release e passam por sessões frias independentes. Esse é o gate intermediário de reutilização da engine, não o fim do roadmap.

### Fase 6 — Runtime espacial, mundo procedural e sandbox

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Depende de | Fase 5 |
| Jogo de prova | Procedural indie sandbox |

**Objetivo:** provar um mundo virtualmente extensível durante viagens longas com memória estável.

**Entregas obrigatórias:**

- runtime espacial opt-in;
- chunks com lifecycle, seed, base gerada e deltas;
- jobs assíncronos com commit em boundary determinístico;
- geração dependente apenas de seed, versão, coordenada e content hash;
- streaming, descarte, cache e persistência por regiões;
- simulation LOD e catch-up determinístico;
- floating origin quando a prova de precisão exigir;
- sandbox voxel estilizado com edição persistente.

**Gate de saída:** geração, viagem, descarte, save por deltas, crash recovery e migration passam; memória estabiliza e o primeiro chunk divergente pode ser localizado por hash.

### Fase 7 — Motion, física, multiplayer e party brawler

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Depende de | Fase 6 |
| Jogo de prova | Physics party brawler |

**Objetivo:** comprovar física 3D por adapters e multiplayer casual player-hosted.

**Entregas obrigatórias:**

- motion visual separado da autoridade lógica;
- comandos, snapshots e autoridade física explícita;
- solvers 2D/3D por adapters aprovados;
- rigid bodies, controllers, constraints, ragdolls, grabs e breakables exigidos pelo jogo;
- input e snapshots sobre transporte local;
- salas pequenas host-authoritative;
- late join, reconexão, interest management e host migration;
- Physics Forge mínimo consumido pelo jogo.

**Gate de saída:** o brawler passa por cenários de física, multiplayer, reconexão e migração; divergências são localizáveis por tick e camada. Não há promessa de multiplayer competitivo, rollback universal, MMO ou igualdade física bit a bit entre plataformas.

### Fase 8 — Construção procedural e diorama builder

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Depende de | Fase 7 |
| Jogo de prova | Procedural diorama builder |

**Objetivo:** entregar autoria em runtime baseada em representação semântica e geometria derivada.

**Entregas obrigatórias:**

- `Construction Graph` textual e versionado;
- comandos semânticos com undo/redo e replay;
- compiler incremental de footprints, volumes, paredes, aberturas e telhados;
- rebuild local por dependências explícitas;
- Building Chemistry rastreável;
- constraint solver especializado;
- picking, handles, splines, brushes e snapping;
- terrain sculpting e decoração dentro de budgets;
- rastreabilidade de cada derivado até nó, regra, asset e comando.

**Gate de saída:** uma edição reconstrói somente a região afetada; mesh, collider, terreno e decoração permanecem correlacionados; undo/redo e replay reproduzem o mesmo grafo.

### Fase 9 — Consolidação dos Forges obrigatórios

| Campo | Valor |
|---|---|
| Estado | `PLANEJADA` |
| Depende de | Fase 8 e consumidores reais dos cinco jogos |

**Objetivo:** consolidar Visual, World, Construction, Physics e Audio Forges como ferramentas independentes de authoring/build time.

Um Forge mínimo pode nascer na fase do jogo que o consome. A Fase 9 estabiliza somente o que já possui consumidor real; ela não cria cinco plataformas especulativas de uma vez.

| Forge | Consumidor mínimo | Evidência exigida |
|---|---|---|
| Visual | personagens, props ou sprites dos jogos | spec, preview, manifest, origem/licença e validação |
| World | sandbox | chunks de amostra, seams, distribuição e budget |
| Construction | diorama builder | estilo, regras, constraints e geometria de amostra |
| Physics | party brawler | collider, massa, joints, estabilidade e cenários |
| Audio | ao menos dois jogos | receita, master/stems ou SFX, análise, loop e manifest |

**Gate de saída:** os cinco Forges produzem artefatos reproduzíveis e inspecionáveis usados pelos jogos. Arquivo opaco sem spec, origem, licença, manifest, preview e relatório falha o gate.

## 8. Jogos de prova

Os jogos não formam uma tarefa única deixada para o final. Cada jogo guia a implementação de uma fase e impede abstração sem consumidor. A conclusão final, porém, exige que todos estejam completos em conjunto.

| Ordem | Jogo | Fase proprietária | Estado | O que comprova |
|---|---|---|---|---|
| 1 | Card roguelite | Fase 2 | `EM ANDAMENTO` | determinismo, conteúdo, UI, replay e operação por chat |
| 2 | Survivor-like | Fase 5 | `PLANEJADO` | segundo uso, Mass Runtime e apresentação em lote |
| 3 | Procedural indie sandbox | Fase 6 | `PLANEJADO` | chunks, streaming, geração, deltas e simulation LOD |
| 4 | Physics party brawler | Fase 7 | `PLANEJADO` | física 3D e multiplayer player-hosted |
| 5 | Procedural diorama builder | Fase 8 | `PLANEJADO` | construção semântica, geometria incremental e autoria em runtime |

**Gate final do portfólio:** os cinco jogos passam por sessões frias, usam releases compatíveis, produzem evidência lógica e visual e exercitam todas as capacidades obrigatórias aplicáveis.

## 9. Capacidades obrigatórias e modularidade

As capacidades abaixo são obrigatórias para concluir a engine, conforme [ADR 0008](docs/adr/0008-mandatory-scale-and-procedural-capabilities.md):

- runtime espacial e mundo procedural;
- Mass Runtime e apresentação escalável;
- física por adapters;
- multiplayer player-hosted;
- construção procedural;
- Visual, World, Construction, Physics e Audio Forges.

Elas são **obrigatórias no programa** e **opt-in em cada projeto**. Um card game não deve carregar chunks, solver físico ou rede que não declarou. Nenhuma fase pode remover essas entregas por repriorização local.

Uma capability avançada só deixa de ser experimental depois de possuir consumidor real, cenário, diagnóstico, observabilidade, budget medido, limites declarados e prova de que projetos que não a usam não pagam seu custo relevante.

## 10. Critérios comuns de promoção

Uma fase só recebe `CONCLUÍDA` quando:

1. o gate específico da fase passou;
2. os gates aplicáveis de [change-gates.md](docs/guardrails/change-gates.md) estão `PASS`;
3. contratos públicos possuem implementação e teste de boundary;
4. limitações e estados não executados estão registrados;
5. a sessão fria aplicável consegue descobrir e repetir a evidência;
6. o backlog aponta para a próxima fase ou entrega;
7. nenhuma capability foi promovida apenas porque o código compila.

Toda alegação de desempenho declara commit, cenário, host, target, backend, hardware, OS, resolução, perfil, warm-up, amostras, variância, métricas e budget. Benchmarks só se tornam oficiais junto da capability correspondente.

## 11. Definição de conclusão do roadmap

O roadmap completo recebe `PASS` somente quando:

- as fases 0–9 estiverem concluídas;
- os cinco jogos de prova estiverem completos;
- native e WebAssembly reproduzirem o mesmo corpus lógico aplicável;
- runtime espacial, Mass Runtime, física, multiplayer e construção passarem por cenários e performance gates;
- os cinco Forges produzirem specs, manifests, previews e validação;
- capabilities avançadas permanecerem opt-in e sem custo relevante para jogos que não as declaram;
- uma sessão fria conseguir alterar, executar, observar, diagnosticar e verificar cada jogo.

Dois jogos comprovam reutilização da fundação. Eles não comprovam a visão completa.

## 12. Fora do roadmap obrigatório

Um host nativo visual e ports para consoles permanecem em `ROTA FUTURA`. Esse trabalho só começa quando houver valor medido e, para consoles, acesso oficial, justificativa comercial, infraestrutura privada e conformidade já comprovada.

O roadmap atual não promete:

- editor visual completo;
- renderer ou solver físico próprios;
- multiplayer competitivo ou MMO;
- mundo aberto fotorrealista AAA;
- um milhão de agentes completos;
- port automático para consoles;
- publicação autônoma em lojas;
- correção automática universal ou julgamento definitivo de diversão.

## 13. Manutenção deste roadmap

Ao promover ou reordenar uma fase, a revisão deve atualizar:

- cabeçalho e painel de progresso;
- marco atual e próxima entrega;
- evidência que passou o gate;
- backlog afetado;
- capability e ADR relacionados, quando aplicável.

Futuras revisões não podem remover pilares obrigatórios do ADR 0008. Ordem, backend e representação interna podem mudar com evidência; contratos publicados, saves, replays e dados do usuário seguem versionamento e migration próprios.
