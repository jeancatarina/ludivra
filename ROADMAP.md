# Roadmap da Ludivra

> Plano de evolução orientado a riscos para uma engine AI-first, text-first e code-first, operável integralmente por chat.

| Campo | Valor |
|---|---|
| Versão | 1.2 |
| Data-base | 2026-07-21 |
| Estado | ativo |
| Escopo | sequência, critérios de promoção, fases obrigatórias e rota futura |

## 1. Autoridade e finalidade

Este documento é a fonte canônica da **sequência de evolução** da Ludivra. Ele não redefine fronteiras técnicas, schemas ou protocolos.

A precedência é:

1. [architecture.md](architecture.md), para premissa, boundaries e decisões arquiteturais;
2. ADRs e contratos executáveis, para decisões e formatos aprovados;
3. este roadmap, para ordem, gates e critérios de promoção;
4. [BACKLOG.md](BACKLOG.md), para tarefas executáveis do marco corrente;
5. índices e relatórios gerados, para estado e evidência.

Em caso de conflito, a fonte de maior precedência vence. Uma mudança deste roadmap não aprova por si só nova dependência de runtime, API, schema, protocolo, formato de save ou replay; essas mudanças seguem os guardrails e, quando exigido, ADR.

O roadmap é deliberadamente evolutivo. “Definitivo” significaria congelar hipóteses antes de comprová-las, contrariando a regra de que o kernel cresce por prova, não por possibilidade.

## 2. Resultado buscado

A unidade principal de trabalho continua sendo uma alteração versionada que outra sessão consegue descobrir, executar, observar, verificar e continuar apenas pelo repositório e pelas evidências produzidas.

A Ludivra terá comprovado sua fundação reutilizável quando atender aos critérios de `architecture.md`, seção 33.3:

- dois jogos materialmente diferentes usando a mesma release da engine;
- capacidades compartilhadas extraídas de usos reais, sem cópia de internals;
- fluxo integral de uma sessão fria pelo chat;
- evidência lógica e visual produzida pelo harness;
- equivalência lógica native/WebAssembly sobre o corpus de replays aplicável.

Esse é um gate intermediário, não o fim do roadmap. A visão completa exige obrigatoriamente runtime espacial, mundo procedural, Mass Runtime, física por adapters, multiplayer player-hosted, construção procedural e os cinco Forges, comprovados pelos cinco jogos definidos no [ADR 0008](docs/adr/0008-mandatory-scale-and-procedural-capabilities.md).

Essas capabilities são obrigatórias para a engine completa, mas modulares por projeto. Um card game não carrega chunks, solver físico ou rede que não declarou; obrigatoriedade de entrega não significa custo universal de runtime nem promoção automática ao kernel.

## 3. Correções incorporadas nesta revisão

| Problema da proposta consolidada | Correção adotada |
|---|---|
| Confundia capacidades obrigatórias da engine com dependências obrigatórias de todo jogo | Runtime espacial, Mass Runtime, física, multiplayer, construção e Forges são entregas obrigatórias, mas capabilities opt-in por projeto |
| Exigia chunks, streaming e LOD de todos os jogos | Runtime espacial será obrigatório no portfólio e comprovado pelo sandbox; um card game não carregará sua complexidade |
| Colocava renderer depois de física, mundo e multiplayer | O loop visual e o harness vêm antes das expansões que precisam ser observadas |
| Colocava persistência e replay depois de mundo e física | Save, replay, hashes e equivalência permanecem fundação anterior a sistemas difíceis de reproduzir |
| Propunha uma engine física própria por enumeração de features | Ludivra define autoridade e contratos semânticos; solvers 2D/3D entram por adapters aprovados |
| Tratava cinco jogos como trabalho simultâneo | Os cinco jogos são obrigatórios, mas sequenciados; o segundo já comprova reutilização e os demais comprovam as capacidades avançadas |
| Criava muitos índices `.ludivra` potencialmente concorrentes | Um estado de projeto gerado aponta para catálogos proprietários; novos índices só surgem por necessidade medida |
| Tornava desktop o host universal e proibia localhost | O target é explícito ou definido pelo projeto; transporte e carregamento são detalhes seguros do host |
| Chamava CSS de contrato | CSS é fonte textual de apresentação; contratos públicos continuam em schemas e protocolos versionados |
| Exigia todos os IDs de correlação em todo dado | Cada registro usa `runId` e os identificadores causalmente aplicáveis; campos irrelevantes não são fabricados |
| Proibia binário como única verdade de forma ampla demais | Autoria permanece textual; saves, replays e estado do usuário podem ser binários versionados, inspecionáveis e migráveis |
| Exigia as oito dimensões completas até para capability planejada | Maturidade e aplicabilidade são explícitas; somente capability que deixe de ser experimental precisa de todos os gates aplicáveis em `PASS` |
| Misturava geração visual e sonora com responsabilidades do runtime | Os cinco Forges são obrigatórios em authoring/build time, com origem, licença, receita e validação, sem autoridade no runtime |
| Fazia alegações de escala sem hardware nem baseline | Toda promoção de escala exige cenário, perfil, hardware, versão, variância e budget aprovado |

## 4. Invariantes transversais

As fases abaixo não substituem os guardrails. Em todas elas:

- gameplay autoritativo permanece independente de renderer, host e vendor;
- Lua altera estado apenas por comandos validados e usa tempo e RNG lógicos;
- JSONC é a autoria declarativa; TypeScript implementa hosts, ferramentas e apresentação; C++ recebe apenas responsabilidades justificadas;
- dados derivados não se tornam segunda fonte de verdade;
- toda mudança pública possui owner, versão, contrato e teste de boundary;
- execução material produz diagnóstico estruturado e evidência proporcional ao risco;
- automação não publica, assina, compra, apaga dados ou acessa segredos sem autoridade explícita;
- otimização e abstração reutilizável só são promovidas após evidência.

### 4.1 Operabilidade por IA

`Discover`, `Author`, `Execute`, `Observe`, `Diagnose`, `Repair`, `Verify` e `Continue` formam uma matriz de avaliação, não uma promessa de reparo universal.

Cada dimensão recebe um dos estados:

- `PASS`: comprovada por contrato e evidência atual;
- `FAIL`: deveria funcionar no escopo declarado e falhou;
- `NOT_RUN`: aplicável, mas não executada;
- `NOT_AVAILABLE`: ainda não implementada no target;
- `NOT_APPLICABLE`: fora do contrato da capability, com motivo;
- `INCONCLUSIVE`: evidência insuficiente.

`NOT_RUN`, `NOT_AVAILABLE` e `INCONCLUSIVE` nunca equivalem a `PASS`. Reparos continuam classificados conforme risco; decisões artísticas, comerciais, destrutivas ou dependentes de segredo permanecem humanas.

### 4.2 Estado e catálogos

O projeto terá um único estado derivado e regenerável. Ele referencia, sem copiar:

- commit e dirty state;
- versões da engine, toolchain e contratos;
- manifesto do projeto;
- catálogo gerado de capabilities;
- decisões e backlog relevantes;
- último run compatível e seus artefatos;
- limitações conhecidas.

A divergência anterior foi removida na versão 0.5.0: `.ludivra/project-state.json`, gerado por `game status`, é o único índice de estado do projeto. Não serão adicionados `module-index`, `target-index`, `diagnostic-index` e outros arquivos separados enquanto consultas sobre um catálogo proprietário ou o índice composto forem suficientes.

## 5. Estado de partida

A versão 0.5.0 fecha a fundação verificável e preserva as capacidades implementadas anteriormente:

- kernel C++20, C ABI, Lua sandbox e runner native headless;
- build WebAssembly e equivalência lógica automatizada;
- saves e replays versionados;
- protocolo de apresentação, renderer Three.js e BrowserHost;
- eventos semânticos de áudio e efeitos;
- ElectronHost, storage, lifecycle e empacotamento desktop/Steam experimental;
- CLI estruturada com `doctor`, `inspect`, `new`, `validate`, `test`, `run`, `build` e `package`;
- catálogo gerado e validado de capabilities experimentais;
- estado canônico regenerável por `game status`;
- artifact manifest com hashes para toda execução da CLI;
- fitness functions de packages, CMake, boundaries e arquivos gerados;
- CI com actions fixadas e matriz nativa, além de equivalência WebAssembly.

Isso ainda não comprova a visão completa. O starter é uma demonstração arquitetural, o control protocol/harness está incompleto, os pacotes distribuíveis de Windows e Linux ainda não foram validados em runners nativos e não existem hosts Android/iOS utilizáveis.

## 6. Fase 0 — Fechar a fundação verificável

**Objetivo:** transformar os componentes existentes em uma base cuja situação possa ser afirmada sem depender de relato manual.

**Status:** concluída na versão 0.5.0.

### Entregas

1. reconciliar o caminho e o schema do estado canônico do projeto;
2. enriquecer manifests de capability apenas com campos consumidos pela CLI e por gates reais;
3. concluir o artifact manifest por execução, com commit, dirty state, comando, versões, target, perfil e hashes;
4. automatizar regras de imports, ciclos, arquivos gerados e boundaries ainda manuais;
5. configurar CI com ações fixadas e matriz disponível;
6. manter `CAPABILITIES.json` como saída gerada, nunca edição concorrente;
7. tornar status e limitações rastreáveis até evidências atuais.

### Fora de escopo

- Context Engine inferencial;
- dashboards próprios;
- vários índices redundantes;
- repair automático geral;
- sistemas espaciais, física, multiplayer ou forges.

### Gate de saída

Uma sessão nova identifica, por comandos e arquivos canônicos, o que existe, o que é experimental, o que falhou e qual evidência ainda corresponde ao commit atual.

## 7. Fase 1 — Harness e ciclo de operabilidade por chat

**Objetivo:** fechar o ciclo `executar → controlar → observar → diagnosticar → verificar` antes de ampliar o domínio da engine.

### Entregas

1. control protocol local, versionado e disponível somente em desenvolvimento/teste;
2. operações mínimas: `health`, `load_scenario`, `act`, `wait_for`, `inspect`, `capture`, `metrics` e `shutdown`;
3. processo e timeouts pertencentes à CLI, com encerramento limpo;
4. `UiViewModel` e `RenderedUiSnapshot` inspecionáveis;
5. timeline causal mínima de input, comandos, eventos e apresentação;
6. scenario harness com assertions semânticas, screenshot e replay;
7. `game simulate`, `game capture`, `game replay` e `game report` somente quando seus contratos tiverem implementações reais;
8. sessão fria automatizada sobre o starter.

O endpoint não oferecerá `eval`, shell, Lua/JavaScript arbitrário, filesystem irrestrito nem proxy de rede.

### Context Engine

`game context` será uma camada derivada posterior sobre catálogos, grafo de dependências e diagnósticos confiáveis. A primeira versão pode ser busca determinística por owner, capability, contrato e cenário. Recomendações heurísticas ou por modelo só entram quando puderem citar as fontes usadas e assumir `INCONCLUSIVE` sem inventar certeza.

### Gate de saída

Uma sessão fria altera um comportamento limitado do starter, executa um cenário, inspeciona estado lógico e visual, reproduz a execução e produz artifact bundle sem operação manual fora do chat.

## 8. Fase 2 — Primeiro jogo real e loop visual completo

**Objetivo:** construir um card roguelite pequeno, porém completo, sem extrair antecipadamente um kit genérico de cartas.

### O jogo deve comprovar

- loop com início, progressão e fim;
- gameplay determinístico em Lua;
- conteúdo JSONC validado;
- UI semântica, acessível e navegável;
- input lógico;
- apresentação 2D/3D estilizada pelo protocolo existente;
- áudio e efeitos sem autoridade lógica;
- save, migration e replay;
- BrowserHost, um perfil desktop e os cenários de captura aplicáveis;
- build reproduzível e sessão fria.

Motion visual simples (`tween`, `spring`, `path`, `snap`) pode nascer no módulo de apresentação se o jogo o exigir. Ele não deve introduzir física autoritativa nem conceitos genéricos sem consumidor.

### Gate de saída

O jogo atende à definição de vertical slice da arquitetura, possui critérios observáveis e pode ser modificado por uma sessão nova. “Starter executa” não satisfaz este gate.

## 9. Fase 3 — Desktop comercial e Steam

**Objetivo:** promover o ElectronHost experimental a caminho distribuível e verificável.

### Entregas

- carregamento de bundle empacotado sem servidor de desenvolvimento no aplicativo distribuído;
- cache incremental apenas onde medições mostrarem benefício;
- smoke test do aplicativo instalado/empacotado;
- pacotes macOS, Windows e Linux validados em runners nativos;
- lifecycle, storage, crash report e update com políticas explícitas;
- adapters Steam opcionais por contratos de plataforma;
- SBOM, provenance, hashes e verificação de licença;
- receitas separadas para assinatura, notarização e SteamPipe.

`game run` não assume desktop universalmente: o projeto ou a opção de target escolhe o host. Browser pode usar loopback seguro em desenvolvimento; Electron pode carregar bundle local. A implementação do transporte não altera o contrato do control protocol.

Assinar, notarizar, configurar credenciais ou enviar à loja exige autoridade e ambiente do usuário. `package` produz pacote local; qualquer futuro comando de publicação será separado e auditável.

### Gate de saída

Cada target declarado possui pacote e smoke test no sistema correspondente. Targets não executados permanecem `NOT_RUN`, nunca “compatíveis por inferência”.

## 10. Fase 4 — Mobile

**Objetivo:** provar que a separação entre kernel, protocolos e host sobrevive a Android e iOS.

### Entregas

- CapacitorAndroidHost e CapacitorIosHost;
- touch, layout adaptativo, safe areas e orientação;
- pause/resume, background, pressão de memória e perda de contexto;
- checkpoint atômico durante lifecycle;
- adapters opcionais de haptics, identidade, commerce e cloud;
- perfis e testes em dispositivos reais de referência.

### Gate de saída

O primeiro jogo executa, persiste, suspende e retoma em Android e iOS dentro de budgets medidos. Ausência de serviço de plataforma produz resultado explícito e fallback testado quando permitido.

## 11. Fase 5 — Survivor-like, Mass Runtime e reuso

**Objetivo:** entregar o segundo jogo obrigatório, comprovar reutilização e sustentar milhares de agentes por dados e apresentação em lote.

### Entregas

- spatial grid e queries com escopo explícito;
- armazenamento contíguo e operações massivas apenas onde profiling comprovar necessidade;
- agentes completos, simplificados e agregados com transições observáveis;
- damage fields e comandos em lote;
- projeção por buffers, instancing, batching, pooling e budgets;
- degradação exclusivamente visual;
- benchmarks 2D e 3D em hardware de referência.

Lua configura comportamentos e reage a eventos agregados. Callback Lua completo por inimigo por frame não será o caminho de escala. A API comum com o card roguelite só será extraída quando os dois usos realmente compartilharem semântica.

### Gate de saída

Card roguelite e survivor-like consomem a mesma release, passam por sessões frias independentes e comprovam a fundação reutilizável. O survivor-like mantém gameplay completo onde importa, horda visual escalável e causa diagnosticável para violações de budget.

## 12. Fase 6 — Runtime espacial, mundo procedural e sandbox

**Objetivo:** entregar o terceiro jogo obrigatório, um procedural indie sandbox, e provar um mundo virtualmente extensível por viagens longas com memória estável.

### Entregas

- coordenadas e particionamento internos, sem fixar a implementação na API pública;
- chunks opt-in com lifecycle, seed, base gerada e deltas;
- jobs fora do tick com commit em boundary determinístico;
- geração por seed, ID, versão, coordenada e content hash;
- streaming, descarte, cache e persistência por regiões medidos;
- simulation LOD e catch-up determinístico;
- floating origin quando a prova de precisão exigir;
- voxel estilizado inicial com biomas, cavernas, recursos, estruturas pequenas e edição persistente.

Representação de coordenadas, tamanho de chunk, storage de região, algoritmo procedural e versionamento exigem protótipo e ADR quando alterarem contratos duráveis. Ordem de carregamento, hardware, relógio e conclusão de jobs não podem mudar o estado lógico.

O runtime espacial é obrigatório na engine completa, mas continua opt-in. Jogos pequenos mantêm as coordenadas superiores e o streaming desativados sem carregar o custo de um mundo infinito.

### Gate de saída

O sandbox passa por geração, viagem além do conteúdo inicialmente residente, descarte, save por deltas, crash recovery, migration e sessão fria. A memória estabiliza, chunks descartados liberam recursos, o mundo continua se estendendo sob demanda e o primeiro chunk divergente pode ser localizado por hash.

## 13. Fase 7 — Motion, física, multiplayer e party brawler

**Objetivo:** entregar o quarto jogo obrigatório, um physics party brawler player-hosted.

### Motion e física

- motion visual permanece na apresentação;
- gameplay físico usa comandos, autoridade explícita e snapshots;
- solvers 2D/3D são dependências por adapter, nunca classes do backend na API pública;
- física visual não decide regra;
- física autoritativa cross-platform promete somente o nível de determinismo comprovado;
- rigid bodies, controllers, constraints, ragdolls, agarrões e breakables entram na ordem exigida pelo jogo;
- Physics Forge produz colliders, massa, joints, grab points e cenários validados.

### Multiplayer player-hosted

1. protocolo de input e snapshot sobre transporte local;
2. host-authoritative em sala pequena;
3. late join e reconexão;
4. interest management mensurado;
5. transportes externos por adapters;
6. host migration após snapshot completo e cenários de falha.

Relay é transporte, não servidor de gameplay. WebRTC, Steam Networking, UDP ou serviços de convite dependem de ADR, licença, segurança e targets. Física host-authoritative não implica igualdade bit a bit entre plataformas; replay registra as informações necessárias para diagnosticar divergência.

Esta fase não promete multiplayer competitivo, rollback universal, anticheat forte ou MMO.

### Gate de saída

O brawler comprova física 3D, multiplayer casual, reconexão e host migration dentro dos budgets aprovados. A IA reproduz divergências, localiza o primeiro tick e diferencia falha lógica, física, de transporte e de apresentação.

## 14. Fase 8 — Construção procedural e diorama builder

**Objetivo:** entregar o quinto jogo obrigatório, um procedural diorama builder com autoria em runtime.

### Entregas

- `Construction Graph` textual e versionado como fonte semântica;
- comandos semânticos com undo/redo, replay e multiplayer-ready data;
- compiler de geometria incremental para footprints, volumes, paredes, aberturas e telhados do slice;
- rebuild local baseado em dependências explícitas;
- regras contextuais de Building Chemistry com causa rastreável;
- constraint solver especializado, nunca universal;
- picking, handles, splines, brushes e snapping como capabilities de runtime;
- terrain sculpting e decoração contextual dentro de budgets;
- todo derivado aponta para node, regra, asset e comando de origem.

Booleanas, splines, telhados, terreno e decoração entram incrementalmente pelos casos do jogo. A obrigação é comprovar o conjunto descrito pelo vertical slice, não implementar toda operação geométrica imaginável.

### Gate de saída

Mover uma parede reconstrói apenas a região afetada; mesh, collider, terreno e decoração permanecem correlacionados; undo/redo e replay reproduzem o mesmo grafo; e uma sessão fria explica cada consequência.

## 15. Fase 9 — Forges obrigatórios

**Objetivo:** consolidar Visual, World, Construction, Physics e Audio Forges usados pelos cinco jogos.

Os Forges são ferramentas independentes e obrigatórias de authoring/build time. Cada um:

- recebe spec textual e parâmetros versionados;
- produz arquivos convencionais, manifest, hashes, origem/licença, preview e relatório;
- registra toolchain, seed e receita de regeneração quando possível;
- não adiciona autoridade ao runtime;
- não torna serviço externo obrigatório para executar o jogo;
- não promete reconstrução idêntica quando o gerador externo não a oferece.

### Provas obrigatórias

| Forge | Consumidor mínimo | Evidência |
|---|---|---|
| Visual Forge | personagens, props ou sprites dos jogos | preview, LOD/collision quando aplicável e validação de asset |
| World Forge | procedural indie sandbox | chunks de amostra, seams, distribuição e budget |
| Construction Forge | procedural diorama builder | estilo, regras, constraints e geometria de amostra |
| Physics Forge | physics party brawler | collider, massa, joints, estabilidade e cenários físicos |
| Audio Forge | ao menos dois jogos | master/stems ou SFX, análise, loop e manifest |

Cada Forge precisa de owner, avaliação de dependências e contratos próprios. A Ludivra pode integrar ferramentas existentes; não precisa reimplementar modelagem, rigging, síntese musical ou geração de imagem completas.

### Gate de saída

Os cinco Forges produzem artefatos reproduzíveis e inspecionáveis usados por jogos reais. Arquivo opaco sem spec, origem, licença, manifest, preview e validação falha o gate.

## 16. Gate comum das capacidades obrigatórias

Uma capability avançada só pode deixar de ser experimental depois de:

- cumprir o jogo de prova que a possui;
- possuir cenário e diagnóstico no boundary público;
- oferecer observabilidade proporcional ao domínio;
- passar budget aprovado em hardware de referência;
- documentar limites e fallback;
- demonstrar que jogos sem a capability não pagam seu custo relevante;
- ter dois usos materialmente diferentes quando reutilização além do jogo proprietário for alegada.

Obrigatoriedade no roadmap não permite marcar a capability como pronta antecipadamente. Até o gate passar, o status correto continua experimental, `NOT_AVAILABLE`, `NOT_RUN` ou `INCONCLUSIVE` conforme o caso.

## 17. Rota futura — Diagnóstico nativo e consoles

Um host nativo visual mínimo pode ser criado para replay, input, áudio básico e profiling fora do stack web quando essa independência trouxer valor mensurável.

Consoles permanecem uma rota futura, não uma fase obrigatória para concluir o roadmap atual. O trabalho só começa com acesso oficial, justificativa comercial, infraestrutura privada e conformidade do kernel já comprovada. Renderer, UI, áudio, cooker e host serão substituíveis; Three.js, DOM, Electron e Capacitor não são prometidos nesses targets.

## 18. Portfólio obrigatório de jogos de prova

| Jogo | Papel obrigatório |
|---|---|
| Card roguelite | fecha o primeiro vertical slice, determinismo, UI, saves, replays e operação por chat |
| Survivor-like | prova segundo uso, Mass Runtime, spatial grid e apresentação em lote |
| Procedural indie sandbox | prova chunks, streaming, mundo procedural, deltas e simulation LOD |
| Physics party brawler | prova física 3D e multiplayer player-hosted |
| Procedural diorama builder | prova Construction Graph, geometria incremental e autoria em runtime |

Todos os cinco jogos são obrigatórios. Eles são implementados em sequência para que cada capability nasça de um consumidor real. Nenhum jogo justifica antecipadamente APIs que seu vertical slice ainda não usa.

## 19. Performance e alegações de escala

Perfis iniciais pertencem aos targets realmente suportados. `desktop-low`, `desktop-medium`, `desktop-high`, `mobile-low` e `mobile-high` podem existir quando houver dispositivos e baselines correspondentes.

Todo benchmark oficial declara:

- versão e commit;
- cenário e conteúdo;
- host, target e backend;
- hardware, OS e resolução;
- perfil e configuração efetiva;
- warm-up, número de amostras e variância;
- métricas P50/P95/P99 aplicáveis;
- budget aprovado e resultado.

Benchmarks como hordas, voxel travel, host migration, geometry rebuild ou planet LOD só se tornam oficiais junto de suas capabilities. Até lá são candidatos, não garantias da engine.

Degradação de apresentação pode reduzir resolução, sombras, partículas, LOD e pós-processamento. Ela não pode alterar silenciosamente gameplay, economia, colisão autoritativa ou resultado de replay.

## 20. Definition of Done do roadmap

Uma entrega só avança de fase quando:

- os gates aplicáveis de `docs/guardrails/change-gates.md` estão `PASS`;
- contratos públicos possuem implementação e teste de boundary;
- estados não executados estão registrados com risco;
- a sessão fria aplicável consegue descobrir e repetir a evidência;
- limitações estão declaradas;
- não há capability promovida além de experimental com base apenas em código existente;
- o backlog foi reconciliado com o próximo marco.

Uma capability que deixe de ser experimental deve cobrir as oito dimensões de operabilidade que forem aplicáveis. Uma capability experimental pode ter dimensões incompletas, desde que o manifest e o relatório não escondam isso.

O roadmap completo só recebe `PASS` depois dos cinco jogos, das capacidades obrigatórias de escala, do multiplayer player-hosted, da construção procedural e dos cinco Forges. O gate intermediário de dois jogos prova reutilização, mas não encerra o programa.

## 21. Próxima prioridade

O próximo marco da engine é a **Fase 1 — Harness e ciclo de operabilidade por chat**, começando pelo `ENG-012`, o control protocol local de desenvolvimento e teste. Em seguida vêm scenario harness, captura, artifact bundle ampliado e sessão fria automatizada.

Física avançada, mundo procedural, Mass Runtime, multiplayer, construção procedural e Forges permanecem fora do marco corrente, mas são fases posteriores obrigatórias.

## 22. Política de evolução

Futuras revisões devem alterar a seção afetada e registrar no diff:

- evidência nova que motivou a mudança;
- fase promovida, reordenada ou adiada;
- impacto sobre backlog e capabilities;
- ADR necessário, se houver.

Uma capacidade obrigatória definida no ADR 0008 não pode ser removida por repriorização local. Sua remoção exige nova decisão arquitetural explícita, atualização do ADR, dos jogos de prova e dos critérios de conclusão. Ordem, backend e representação interna podem evoluir com evidência; contratos publicados, saves, replays e dados do usuário seguem suas políticas próprias de versionamento e migração.
