# ADR 0010 — Control protocol local e scenario harness determinístico

- Status: aceito
- Data: 2026-07-22
- Revisão: antes de alterar operações, transporte ou schemaVersion do protocolo v1

## Contexto

A fundação 0.5 tornou estado e evidências rastreáveis, mas ainda não fecha o ciclo de uma sessão por chat. A CLI consegue compilar e testar, porém não possui um vocabulário versionado para controlar uma execução, esperar condições, inspecionar estado lógico e UI, capturar apresentação ou produzir um bundle de cenário reproduzível.

O primeiro harness precisa funcionar sem abrir uma porta de execução arbitrária, não pode depender de um editor e deve continuar verificável nos runners suportados. A Fase 1 precede o primeiro jogo visual completo; portanto ela precisa provar semântica, causalidade e evidência sem antecipar uma dependência pesada de automação de navegador.

## Decisão

### Transporte e autoridade

O adapter inicial usará JSON Lines sobre `stdio` entre a CLI e um worker filho. A CLI será dona do processo, do token aleatório por execução, dos timeouts e do encerramento. O worker aceitará somente mensagens válidas por `contracts/control-protocol.schema.json` e somente as operações enumeradas no contrato.

O protocolo existirá apenas nas ferramentas de desenvolvimento e teste. Ele não será incluído nos bundles de produção nem será exposto pelo BrowserHost. Não haverá `eval`, shell, caminhos de filesystem, Lua/JavaScript arbitrário ou proxy de rede nos payloads.

### Operações v1

O vocabulário inicial será `health`, `load_scenario`, `act`, `wait_for`, `inspect`, `capture`, `metrics`, `verify_replay` e `shutdown`. `verify_replay` é a única extensão ao conjunto mínimo do roadmap e existe para sustentar o comando real `game replay` sem criar um caminho paralelo não versionado.

### Cenários e inspeção

Cenários JSONC seguirão `schemas/scenario.schema.json`. Steps e assertions usarão uniões fechadas; strings executáveis e expressões livres não serão permitidas.

O manifest de jogo passa ao schema v2 e declara `inspection.integerStates` e ao menos um cenário. Como a engine ainda está em 0.x, o starter é migrado diretamente e não haverá leitura paralela silenciosa do schema v1.

O adapter headless produzirá:

- estado autoritativo com tick, hash e inteiros declarados pelo projeto;
- `UiViewModel` derivado do manifest e do estado;
- `RenderedUiSnapshot` de um layout canônico de teste;
- timeline causal mínima de input, mudança de estado comprometida, evento de apresentação e frame projetado;
- replay binário verificado pelo próprio runtime;
- captura SVG determinística vinculada aos snapshots.

A mudança de estado registrada como etapa `command` será explicitamente marcada como `committed-state-diff`: ela descreve o efeito comprometido, não finge expor a instrução Lua interna.

### Comandos e bundles

`game simulate`, `game capture`, `game replay`, `game report` e `game context` terão implementações reais. Uma simulação produzirá summary, comandos, diagnósticos, métricas, snapshots, trace causal, replay e capturas dentro do run atual. `game context` fará busca determinística e citável sobre capabilities e seus contratos; ausência de correspondência retornará `INCONCLUSIVE` como dado, não uma certeza inventada.

### Captura visual

Na Fase 1, a captura será SVG produzida pelo renderer semântico headless. Ela comprova composição, texto, bounds e vínculo com o estado sem afirmar equivalência com pixels do Three.js. Screenshot raster e `RenderedUiSnapshot` do BrowserHost são gates da Fase 2.

## Consequências

- o harness funciona em processo isolado e sem porta local;
- cenários são reproduzíveis e revisáveis em diff;
- a CLI consegue controlar e terminar uma execução sem intervenção manual;
- o artifact bundle passa a conter evidência lógica, causal e visual;
- o starter ganha um cenário canônico e uma sessão fria automatizada;
- manifests v1 falham com diagnóstico de schema e precisam ser migrados explicitamente ao formato v2;
- falha de schema, timeout, worker encerrado ou assertion produz diagnóstico estável;
- captura headless não pode ser usada para alegar correção do renderer Three.js.

## Alternativas rejeitadas

- WebSocket aberto no BrowserHost: amplia superfície e exige lifecycle de porta antes de haver consumidor real;
- `executeJavaScript` como API do harness: equivale a expor `eval` e elimina o contrato fechado;
- Playwright como dependência fundacional: antecipa custo e vendor antes do gate visual do primeiro jogo;
- cenário implementado em TypeScript ou Lua: cria código arbitrário onde o formato deve permanecer declarativo;
- inferir comandos Lua exatos pelo diff: poderia produzir causalidade falsa quando vários comandos resultassem no mesmo estado.
