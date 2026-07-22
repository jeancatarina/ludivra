# Relatório da sessão

## Resultado

Ludivra 0.6.0 com a Fase 1 do roadmap implementada em 2026-07-22.

## Implementado

- ADR 0010 define o control protocol local, o scenario harness e o limite da captura headless;
- protocolo v1 e schema de cenário possuem contratos fechados e bindings gerados;
- worker WASM isolado usa stdio, token efêmero, timeout e encerramento pertencentes à CLI;
- operações `health`, `load_scenario`, `act`, `wait_for`, `inspect`, `capture`, `metrics`, `verify_replay` e `shutdown` estão implementadas;
- `game context`, `simulate`, `capture`, `replay`, `report` e `run --control` possuem implementação real;
- runs de cenário produzem estado lógico, UiViewModel, RenderedUiSnapshot, timeline causal, métricas, captura SVG e replay;
- o starter possui cenário versionado e chaves de estado inspecionáveis;
- uma sessão fria automatizada copia o starter, altera a regra de carga de 1 para 2, valida e comprova o resultado;
- CI executa harness e sessão fria no job WebAssembly.

## Evidências locais

- CLI: 9 testes PASS, incluindo bloqueio de operação arbitrária e context search citável;
- scenario harness: PASS, run `run_ab7f8993-1ce1-4682-89cf-e6ca600f159e`;
- sessão fria: PASS, run efêmero `run_70e9338b-ac44-4488-9d46-17855696857c`;
- replay independente e relatório do cenário: PASS;
- timeline do starter contém input, command diff, eventos de áudio/efeito e apresentação.
- captura SVG convertida para PNG e inspecionada: texto, estado, visual do núcleo e ações estão visíveis sem clipping.

## Limitações

- captura raster do BrowserHost: `NOT_AVAILABLE` nesta fase; a captura atual é SVG semântica headless;
- trace de command buffer privado: `NOT_APPLICABLE`; a timeline expõe o diff comprometido sem vazar instruções Lua;
- packages instaláveis Windows/Linux: `NOT_RUN`; pertencem ao gate desktop;
- assinatura, notarização e publicação: `NOT_APPLICABLE`, dependem de autoridade explícita.

## Próxima prioridade

`ENG-016` — implementar o loop jogável do card roguelite da Fase 2.
