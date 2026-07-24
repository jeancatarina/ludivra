# Relatório da sessão

## Resultado

Ludivra 0.7.0 com o P0 de operabilidade fechado em 2026-07-24. As Fases 2 e 3 ganharam decisões registradas e implementação: contratos de UI versionados, captura raster com baseline aprovada, cache por família de artefato com invalidação explicável e lifecycle de processos com dono único. Os ADRs 0013 a 0031 passam a cobrir todas as fases do roadmap.

## Implementado

- ADRs 0013 a 0031 e a tabela da seção 36 de `architecture.md` apontando qual decisão fecha cada escolha pendente;
- `contracts/ui-view-model.schema.json` e `contracts/rendered-ui-snapshot.schema.json` com bindings gerados por `tools/contracts/generate-ui.mjs`, proprietário `presentation-protocol`;
- projeção de UI compartilhada: o control worker e o BrowserHost derivam o mesmo `UiViewModel` a partir do manifest e do estado inteiro;
- `UiViewModel` transporta chave de localização e parâmetros; texto resolvido existe apenas no `RenderedUiSnapshot`;
- UI declarativa em DOM acessível no BrowserHost, medindo bounds, visibilidade, clipping, foco efetivo, texto resolvido, papel de acessibilidade e contraste como `browser-dom-v1`;
- `game capture --raster` captura um frame real do bundle web pelo ElectronHost offscreen, com quiescência declarada, tolerância por perfil, baseline versionada e relatório de diff;
- cache por família de artefato — `contracts`, `packages`, `wasm`, `native`, `web-bundle` — com chave por conteúdo, toolchain e ambiente declarado;
- `game build --watch` reconstrói apenas a família proprietária do arquivo alterado e seus dependentes, com `rebuilds.jsonl` por sessão e um único run manifest;
- `process-runner` passa a ser o único dono de criação de processo: timeout obrigatório ou `unbounded` declarado, grupo próprio, `SIGTERM`→`SIGKILL` e terminação de todos os filhos no encerramento;
- o harness e a captura passaram a preparar o runtime pelo mesmo registro de famílias, eliminando as listas de build duplicadas;
- trace de projeção por frame gravado no bundle do run: visuais pedidos pelo projector, transform, visibilidade, câmera e contagem de operações;
- diagnósticos do host coletados no mesmo run e convertidos em falha da captura, incluindo frame sem trabalho de projector.

## Defeitos encontrados e corrigidos pela nova evidência

- os sete botões de ação ficavam `clipped` em 1280x800 porque o canvas do Three.js fixa altura inline e travava a linha `1fr` do grid;
- o BrowserHost inteiro morria quando a bridge desktop estava exposta mas sem handler registrado, em vez de degradar para host indisponível;
- a captura em janela oculta retornava a primeira pintura, antes do runtime terminar; a quiescência passou a exigir dois frames idênticos consecutivos;
- o adapter de captura não tinha prazo na espera de carregamento e podia ficar vivo indefinidamente.

## Evidências locais

- CLI: 15 testes PASS, incluindo contratos de UI, decodificação de PNG com filtros, tolerância de comparação, propriedade de famílias e terminação por timeout;
- `game capture --raster`: baseline aprovada e reproduzida byte a byte na execução seguinte (`changedPixels: 0`);
- cache: quatro famílias `miss NO_ENTRY` em 344s a frio e quatro `hit` em 17s a quente; alterar `hosts/browser/src` invalida apenas `web-bundle` com `INPUT_CHANGED`;
- watch: `rebuilds.jsonl` registra o arquivo disparador e a família reconstruída; `SIGINT` encerra com exit 0, run manifest gravado e nenhum processo remanescente;
- snapshot medido do BrowserHost: 17 nós, nenhum clipado, contraste mínimo 11.7;
- trace de projeção no tick 8: cinco visuais pedidos, câmera registrada, inimigo oculto conforme o estado lógico e um `render` no frame.

## Limitações

- baseline visual aprovada apenas para `desktop/1280x800@2x`: outros viewports, escalas de texto e device scale factors permanecem `NOT_AVAILABLE`;
- captura raster exige Electron instalado e sessão gráfica; runner Linux headless precisaria de display virtual, ainda `NOT_RUN`;
- falhas de renderer e de shader aparecem como erro de script; áudio já reporta com códigos próprios;
- família `content` do cache não existe até o content pack do ADR 0017;
- ADRs 0016 a 0031 são provisórios: fixam direção sem protótipo nem benchmark.

## Próxima prioridade

Fase 4 — SDK Lua público da camada 1 e content pack compilado, conforme os ADRs 0016 e 0017. Da Fase 3 restam apenas ampliar perfis de baseline e detalhar códigos de shader e áudio.
