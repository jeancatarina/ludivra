# Relatório da sessão

## Resultado

Ludivra 0.7.0 com o `ENG-016` implementado como fixture antecipada de integração em 2026-07-22. O ADR 0012 reorganiza o trabalho restante por capacidades técnicas e reserva os cinco jogos completos para a Fase 12.

## Implementado

- ADR 0010 define o control protocol local, o scenario harness e o limite da captura headless;
- protocolo v1 e schema de cenário possuem contratos fechados e bindings gerados;
- worker WASM isolado usa stdio, token efêmero, timeout e encerramento pertencentes à CLI;
- operações `health`, `load_scenario`, `act`, `wait_for`, `inspect`, `capture`, `metrics`, `verify_replay` e `shutdown` estão implementadas;
- `game context`, `simulate`, `capture`, `replay`, `report` e `run --control` possuem implementação real;
- runs de cenário produzem estado lógico, UiViewModel, RenderedUiSnapshot, timeline causal, métricas, captura SVG e replay;
- o starter possui cenário versionado e chaves de estado inspecionáveis;
- uma sessão fria automatizada copia o starter, altera a regra de carga de 1 para 2, valida e comprova o resultado;
- CI executa harness e sessão fria no job WebAssembly;
- ADR 0011 define a autoridade do conteúdo e proíbe duplicação de balanceamento entre JSONC e Lua;
- `examples/card-roguelite` implementa início, dois encontros, recompensa, vitória, derrota e reinício;
- `composeGameplaySource` liga documentos validados ao mesmo chunk Lua no BrowserHost e no control worker;
- os cenários de vitória, derrota e energia/bloqueio verificam estados finais e replay;
- o BrowserHost compila a apresentação Three.js da fixture card roguelite;
- o ADR 0012 define o roadmap feature-first e reclassifica jogos completos como provas integradas finais.

## Evidências locais

- CLI: 10 testes PASS, incluindo bloqueio de operação arbitrária, context search citável e rejeição de conteúdo divergente;
- scenario harness e sessão fria: PASS na suíte integrada;
- cenários `ember-vault.run-victory`, `ember-vault.run-defeat` e `ember-vault.guard-and-energy`: PASS;
- build do BrowserHost para `examples/card-roguelite`: PASS;
- replay independente e relatório do cenário: PASS;
- timeline do starter contém input, command diff, eventos de áudio/efeito e apresentação.
- captura SVG convertida para PNG e inspecionada: texto, estado, visual do núcleo e ações estão visíveis sem clipping.

## Limitações

- captura raster do BrowserHost: `NOT_AVAILABLE` nesta fase; a captura atual é SVG semântica headless;
- UiViewModel e RenderedUiSnapshot reais do BrowserHost: `NOT_AVAILABLE`; pertencem ao `ENG-017`;
- trace de command buffer privado: `NOT_APPLICABLE`; a timeline expõe o diff comprometido sem vazar instruções Lua;
- packages instaláveis Windows/Linux: `NOT_RUN`; pertencem ao gate desktop;
- assinatura, notarização e publicação: `NOT_APPLICABLE`, dependem de autoridade explícita.

## Próxima prioridade

`ENG-017` — produzir `UiViewModel` e `RenderedUiSnapshot` reais no BrowserHost e avançar o gate da Fase 3.
