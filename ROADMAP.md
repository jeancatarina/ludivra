# Roadmap da Ludivra

> Plano de evolução orientado a riscos para uma engine AI-first, text-first e code-first, operável integralmente por chat.

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Data-base | 2026-07-21 |
| Estado | ativo |
| Escopo | sequência, critérios de promoção e trilhas condicionais |

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

A Ludivra estará comprovada como engine reutilizável quando atender aos critérios de `architecture.md`, seção 33.3:

- dois jogos materialmente diferentes usando a mesma release da engine;
- capacidades compartilhadas extraídas de usos reais, sem cópia de internals;
- fluxo integral de uma sessão fria pelo chat;
- evidência lógica e visual produzida pelo harness;
- equivalência lógica native/WebAssembly sobre o corpus de replays aplicável.

Mundos extensos, multidões, construção procedural, física avançada e multiplayer podem ampliar essa prova. Eles não substituem o critério mínimo nem entram automaticamente no núcleo.

## 3. Correções incorporadas nesta revisão

| Problema da proposta consolidada | Correção adotada |
|---|---|
| Transformava “AI-first”, mundos infinitos, mass simulation, construção e forges em pilares igualmente obrigatórios | AI operability e autoria textual permanecem fundamentos; os demais são capacidades condicionais a jogos, medições e ADRs |
| Exigia chunks, streaming e LOD de todos os jogos | Runtime espacial será opt-in; um card game não carregará complexidade de mundo infinito sem necessidade |
| Colocava renderer depois de física, mundo e multiplayer | O loop visual e o harness vêm antes das expansões que precisam ser observadas |
| Colocava persistência e replay depois de mundo e física | Save, replay, hashes e equivalência permanecem fundação anterior a sistemas difíceis de reproduzir |
| Propunha uma engine física própria por enumeração de features | Ludivra define autoridade e contratos semânticos; solvers 2D/3D entram por adapters aprovados |
| Tratava cinco jogos como requisito mínimo simultâneo | Dois jogos diferentes comprovam a engine; jogos adicionais promovem trilhas específicas |
| Criava muitos índices `.ludivra` potencialmente concorrentes | Um estado de projeto gerado aponta para catálogos proprietários; novos índices só surgem por necessidade medida |
| Tornava desktop o host universal e proibia localhost | O target é explícito ou definido pelo projeto; transporte e carregamento são detalhes seguros do host |
| Chamava CSS de contrato | CSS é fonte textual de apresentação; contratos públicos continuam em schemas e protocolos versionados |
| Exigia todos os IDs de correlação em todo dado | Cada registro usa `runId` e os identificadores causalmente aplicáveis; campos irrelevantes não são fabricados |
| Proibia binário como única verdade de forma ampla demais | Autoria permanece textual; saves, replays e estado do usuário podem ser binários versionados, inspecionáveis e migráveis |
| Exigia as oito dimensões completas até para capability planejada | Maturidade e aplicabilidade são explícitas; somente capability que deixe de ser experimental precisa de todos os gates aplicáveis em `PASS` |
| Prometia geração visual e sonora autônoma como parte do runtime | Forges são ferramentas opcionais de authoring/build time, com origem, licença, receita e validação |
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

Antes de expandir esse contrato, a implementação deve resolver a divergência atual entre `PROJECT_STATE.json` do starter e `.ludivra/project-state.json` descrito na arquitetura. Não serão adicionados `module-index`, `target-index`, `diagnostic-index` e outros arquivos separados enquanto consultas sobre um catálogo proprietário ou um único índice composto forem suficientes.

## 5. Estado de partida

A versão 0.4.0 já demonstra partes importantes da fundação:

- kernel C++20, C ABI, Lua sandbox e runner native headless;
- build WebAssembly e equivalência lógica automatizada;
- saves e replays versionados;
- protocolo de apresentação, renderer Three.js e BrowserHost;
- eventos semânticos de áudio e efeitos;
- ElectronHost, storage, lifecycle e empacotamento desktop/Steam experimental;
- CLI estruturada com `doctor`, `inspect`, `new`, `validate`, `test`, `run`, `build` e `package`;
- catálogo gerado de capabilities experimentais.

Isso ainda não comprova a visão completa. O starter é uma demonstração arquitetural, o control protocol/harness está incompleto, o estado canônico do projeto é inconsistente, faltam manifests completos por run, Windows e Linux não foram validados em runners nativos e não existem hosts Android/iOS utilizáveis.

## 6. Fase 0 — Fechar a fundação verificável

**Objetivo:** transformar os componentes existentes em uma base cuja situação possa ser afirmada sem depender de relato manual.

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

## 11. Fase 5 — Segundo jogo e extração de capacidades

**Objetivo:** comprovar reuso sem transformar peculiaridades do primeiro jogo em API da engine.

O segundo jogo será escolhido por diferença material de dinâmica, não por uma lista fixa. Estratégia, gerenciamento, dungeon crawler ou ação moderada são candidatos compatíveis com o posicionamento atual.

### Regra de promoção

1. primeiro uso permanece no jogo;
2. segundo uso diferente revela o núcleo comum;
3. somente a API mínima comum vira capability;
4. terceiro uso estabiliza ou revisa a API;
5. promoção ao kernel exige inadequação medida em Lua/TypeScript e equivalência native/WASM.

### Gate de saída

Dois jogos consomem a mesma release, compartilham somente capacidades justificadas e passam por sessões frias independentes. Este é o primeiro ponto em que a Ludivra pode ser chamada de engine reutilizável segundo a arquitetura.

## 12. Fase 6 — Trilhas condicionais de escala e criação procedural

As trilhas seguintes não são uma sequência obrigatória nem um pacote único. Uma trilha é ativada por um jogo aprovado, possui owner próprio e deve entregar um vertical slice estreito antes de generalizar.

### 12.1 Runtime espacial e mundo procedural

**Gatilho:** sandbox, mapa extenso ou outro jogo demonstra que scene graph e carregamento atuais não atendem memória ou latência.

Primeira prova:

- coordenadas e particionamento internos, sem expor a implementação na API pública;
- chunks opt-in com lifecycle, seed, base gerada e deltas;
- jobs fora do tick com commit em boundary determinístico;
- streaming, descarte e persistência medidos;
- floating origin somente quando a precisão exigir;
- mundo pequeno primeiro; infinito é propriedade emergente de estabilidade, não tipo obrigatório.

Representação de coordenadas, tamanho de chunk, storage de região, algoritmo procedural e política de versionamento exigem protótipo e ADR quando alterarem contratos duráveis. Ordem de carregamento, hardware, relógio e conclusão de jobs não podem mudar o estado lógico.

### 12.2 Motion, física e multidões

**Gatilho:** um jogo real exige interação física ou quantidade de agentes acima do budget do runtime existente.

- motion visual permanece na apresentação;
- gameplay físico usa comandos, autoridade explícita e snapshots;
- solvers 2D/3D são dependências por adapter, nunca classes do backend na API pública;
- física visual não decide regra;
- física autoritativa cross-platform só promete o nível de determinismo comprovado;
- mass simulation começa por dados contíguos, queries espaciais e atualização em lote quando profiling justificar;
- callback Lua completo por agente por frame é rejeitado quando exceder budget;
- agregação e simulation LOD preservam semântica declarada pelo jogo, não uma aproximação universal invisível.

Ragdolls, active ragdolls, agarrões, breakables e hordas gigantes são incrementos separados. Nenhum deles entra no kernel apenas para preencher uma checklist.

### 12.3 Multiplayer player-hosted

**Gatilho:** um jogo co-op ou casual single-player já está estável, reproduzível e mensurado.

Ordem mínima:

1. protocolo de input e snapshot sobre transporte local;
2. host-authoritative em uma sala pequena;
3. late join e reconexão;
4. interest management somente quando o volume exigir;
5. transportes externos por adapters;
6. host migration apenas após snapshot completo e cenários de falha.

Relay é transporte, não servidor de gameplay. WebRTC, Steam Networking, UDP ou serviços de convite dependem de ADR, licença, segurança e targets. Física host-authoritative não implica igualdade bit a bit entre plataformas; replay registra as informações necessárias para diagnosticar divergência.

Essa trilha não promete multiplayer competitivo, rollback universal, anticheat forte ou MMO.

### 12.4 Construção procedural

**Gatilho:** um diorama builder ou sandbox precisa editar construções em runtime.

Primeira prova:

- `Construction Graph` textual e versionado como fonte semântica;
- comandos semânticos com undo/redo e replay;
- compiler de geometria limitado a extrusão, aberturas e telhados necessários ao slice;
- rebuild local baseado em dependências explícitas;
- picking, handles e snapping como capabilities de runtime;
- todo derivado aponta para node, regra, asset e comando de origem.

“Building Chemistry” é um conjunto versionado de regras de domínio, não um solver universal. Booleanas, splines, terrain sculpting, decoração contextual e constraints entram incrementalmente com casos reais e diagnósticos próprios.

### 12.5 Forges de authoring

**Gatilho:** custo repetido e mensurado de produção de assets ou conteúdo que uma ferramenta reproduzível possa reduzir.

Visual, World, Construction, Physics e Audio Forge são ferramentas independentes. Um forge:

- roda em authoring/build time por padrão;
- recebe spec textual e parâmetros versionados;
- produz arquivos convencionais, manifest, hashes, origem/licença, preview e relatório;
- registra toolchain, seed e receita de regeneração quando possível;
- não adiciona autoridade ao runtime;
- não torna serviço externo obrigatório para executar o jogo;
- não promete reconstrução idêntica quando o gerador externo não a oferece.

Cada forge precisa de consumidor real, avaliação de dependências e decisão própria. A engine não implementará modelagem, rigging, síntese musical ou geração de imagem completas apenas para evitar ferramentas existentes.

### Gate comum das trilhas

Uma trilha só pode deixar de ser experimental depois de:

- dois usos materialmente diferentes quando reutilização for alegada;
- cenário e diagnóstico no boundary público;
- observabilidade proporcional ao domínio;
- budget aprovado em hardware de referência;
- documentação de limitações e fallback;
- prova de que jogos sem a capability não pagam seu custo relevante.

## 13. Fase 7 — Diagnóstico nativo e consoles

Um host nativo visual mínimo pode ser criado para replay, input, áudio básico e profiling fora do stack web quando essa independência trouxer valor mensurável.

Consoles permanecem uma rota futura. O trabalho só começa com acesso oficial, justificativa comercial, infraestrutura privada e conformidade do kernel já comprovada. Renderer, UI, áudio, cooker e host serão substituíveis; Three.js, DOM, Electron e Capacitor não são prometidos nesses targets.

## 14. Portfólio de jogos de prova

| Jogo | Papel | Obrigatoriedade |
|---|---|---|
| Card roguelite | fecha o primeiro vertical slice e a operação por chat | obrigatório |
| Segundo jogo materialmente diferente | prova extração e reuso | obrigatório |
| Survivor-like | ativa e mede Mass Runtime e apresentação em lote | condicional |
| Physics party brawler | ativa física avançada e multiplayer player-hosted | condicional |
| Procedural indie sandbox | ativa runtime espacial, chunks e mundo procedural | condicional |
| Procedural diorama builder | ativa Construction Graph e compiler incremental | condicional |

Um jogo condicional só entra no backlog quando sua trilha for escolhida. Ele não é usado para justificar APIs antes da implementação do próprio slice.

## 15. Performance e alegações de escala

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

## 16. Definition of Done do roadmap

Uma entrega só avança de fase quando:

- os gates aplicáveis de `docs/guardrails/change-gates.md` estão `PASS`;
- contratos públicos possuem implementação e teste de boundary;
- estados não executados estão registrados com risco;
- a sessão fria aplicável consegue descobrir e repetir a evidência;
- limitações estão declaradas;
- não há capability promovida além de experimental com base apenas em código existente;
- o backlog foi reconciliado com o próximo marco.

Uma capability que deixe de ser experimental deve cobrir as oito dimensões de operabilidade que forem aplicáveis. Uma capability experimental pode ter dimensões incompletas, desde que o manifest e o relatório não escondam isso.

## 17. Próxima prioridade

O próximo marco da engine é a **Fase 0 — Fechar a fundação verificável**, começando pelo artifact manifest por execução e pela reconciliação do estado canônico do projeto. Isso cria a evidência necessária para o harness e evita construir novos sistemas sobre status manuais ou divergentes.

Depois desse marco, a única prioridade seguinte é a **Fase 1 — Harness e ciclo de operabilidade por chat**. Física avançada, mundo infinito, mass simulation, multiplayer, construção procedural e forges permanecem fora do P0.

## 18. Política de evolução

Futuras revisões devem alterar a seção afetada e registrar no diff:

- evidência nova que motivou a mudança;
- fase ou trilha promovida, adiada ou removida;
- impacto sobre backlog e capabilities;
- ADR necessário, se houver.

Uma trilha pode ser removida se deixar de servir aos jogos e à premissa da engine. Preservar hipóteses sem consumidor não é compatibilidade; contratos publicados, saves, replays e dados do usuário seguem suas políticas próprias de versionamento e migração.
