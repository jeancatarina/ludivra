# ADR 0015 — Captura raster, baselines visuais e evidência de pixels

- Status: aceito
- Data: 2026-07-24
- Revisado: 2026-07-26 para perfis gráficos e evidência dinâmica
- Revisão: antes de aceitar um segundo backend de captura ou de prometer comparação entre backends
- Complementa: [ADR 0010](0010-local-control-protocol-and-scenario-harness.md) e [ADR 0014](0014-declarative-ui-contracts-and-initial-renderer.md)
- Complementa: [ADR 0047](0047-desktop-rendering-profiles-and-backend-policy.md), [ADR 0051](0051-animation-graph-and-skeletal-runtime.md) e [ADR 0052](0052-textual-vfx-and-particle-runtime.md)
- Backlog: `ENG-018`

## Contexto

A captura atual é SVG semântica produzida pelo adapter headless. O ADR 0010 aceitou essa captura como prova de composição, texto, bounds e vínculo com o estado, e recusou explicitamente tratá-la como equivalente aos pixels do Three.js. O ADR 0011 repetiu a recusa.

O gate da Fase 3 exige que, ao observar um defeito nos pixels do BrowserHost, a sessão consiga relacioná-lo ao estado lógico, à ação, ao evento e ao projector, reproduzi-lo por cenário e anexar evidência real ao artifact bundle. Isso exige captura raster do host real, com vínculo causal e critério de comparação — nenhum dos três existe.

Duas restrições delimitam a decisão. Pixels de GPU não são idênticos entre driver, sistema e máquina, portanto igualdade byte a byte não é um critério utilizável. E o repositório não possui navegador de automação: `electron@43.1.1` e `@electron/packager@20.0.3` já são dependências de desenvolvimento fixadas do ElectronHost, enquanto Playwright e Puppeteer não existem.

## Decisão

### Backend de captura

A captura raster do bundle web usa o **ElectronHost existente como adapter de captura**, por `webContents.capturePage`, em janela offscreen com viewport e escala declaradas.

Nenhum navegador de automação novo é adicionado. Um segundo backend de captura só entra por revisão deste ADR, com o defeito específico de motor como evidência, nunca por extensão silenciosa.

O adapter de captura é borda: ele não conhece regra de jogo e não decide quando capturar.

### Vínculo causal obrigatório

Toda captura carrega `runId`, tick, hash do estado lógico, id do renderer conforme o ADR 0014, perfil pedido e efetivo, método gráfico, adapter, classe de GPU/driver quando disponível, viewport pedido, tamanho real da imagem, escala de texto, locale efetivo e a condição de quiescência aplicada.

A captura só ocorre depois de uma condição de quiescência declarada. Capturar sem condição declarada é proibido, porque produziria evidência que falha de forma intermitente sem defeito no jogo.

A quiescência tem três partes, e todas são necessárias:

1. **tick determinístico** — o host recebe `?ludivra-capture=<ticks>`, substitui o laço de animação por exatamente esse número de ticks lógicos e projeta uma vez. Sem isso o texto do frame depende do escalonador;
2. **prontidão declarada pela página** — o host publica `window.ludivraUi.ready` somente após projetar; o adapter espera esse sinal em vez de adivinhar por tempo;
3. **frame estável** — dois `capturePage` consecutivos idênticos. Uma janela oculta não repinta necessariamente após a primeira pintura, e sem essa terceira condição o adapter grava o frame anterior ao boot enquanto o DOM já está completo. Esse defeito foi observado e é a razão da regra.

Quiescência não atingida é `CAPTURE_NOT_QUIESCENT` ou `CAPTURE_FRAME_NOT_STABLE`; nunca captura parcial silenciosa. O caminho de captura não usa `wait_for` do control protocol: ele dirige o host real, não o worker headless.

O bundle do run recebe a imagem, o `RenderedUiSnapshot` correspondente e o `capture-diff.json` quando houver baseline.

### Classificação de falhas do renderer

O artifact bundle inclui os diagnósticos do host. Falha não classificada continua como `HOST_SCRIPT_ERROR`, mas o adaptador de renderização deve propagar falhas estruturadas: inicialização, operação, frame, resize, descarte e contexto usam códigos `RENDER_*`; compilação ou link de shader usa `SHADER_COMPILE_FAILED`. O callback de compilação do backend é a fonte do log de shader, portanto uma falha de GPU não pode ser reduzida a erro genérico de script.

### Formato e comparação

O formato é PNG sem perda. A comparação **não** exige igualdade byte a byte. Cada perfil declara tolerância: fração máxima de pixels alterados, delta máximo por canal e regiões ignoradas quando houver conteúdo legitimamente variável.

O relatório de diff registra pixels alterados, delta máximo, caixas das regiões afetadas e a tolerância aplicada. Aprovar um diff sem relatório é proibido.

### Baselines

Baselines vivem versionadas **no projeto**, em `tests/baselines/<nome>/<backend>/<perfil>/<largura>x<altura>@<escala>x.png`, uma por combinação declarada. O jogo é dono das suas baselines; a engine não guarda evidência visual de projetos. Capturas de execução permanecem no bundle do run ignorado pelo Git.

O device scale factor, o método gráfico e o perfil efetivo entram no caminho da baseline porque frames produzidos por escalas ou métodos diferentes não são comparáveis. Sem isso, a mesma baseline acusaria defeito inexistente ou esconderia fallback; com isso, a combinação ausente é `CAPTURE_BASELINE_MISSING`, ou seja `NOT_AVAILABLE`.

Atualização de baseline só ocorre por mudança intencional que carregue o relatório de diff no mesmo change set.

Combinação sem baseline aprovada não pode ser alegada como suporte visual, seguindo a regra da target matrix.

### Evidência dinâmica

Animação, blend, trails, subemitters, transições e frame pacing exigem sequência de frames ou vídeo com seed, tick range, perfil e método fixos. Screenshot isolado continua válido para composição estática e proibido como única prova de comportamento temporal. A revisão de vídeo não exige pixels idênticos entre GPUs; exige métricas, eventos e frames-chave correlacionados ao mesmo run.

### O que continua fora

A captura SVG headless permanece válida como evidência de composição e semântica e continua proibida como evidência de pixels. Este ADR não promete comparação de pixels entre métodos gráficos diferentes, profiling de GPU completo nem baseline por máquina de desenvolvedor. Vídeo é evidência dinâmica correlacionada, não baseline byte a byte.

Códigos: `CAPTURE_RASTER_UNAVAILABLE`, `CAPTURE_NOT_QUIESCENT`, `CAPTURE_FRAME_NOT_STABLE`, `CAPTURE_BUNDLE_LOAD_FAILED`, `CAPTURE_BUNDLE_LOAD_TIMEOUT`, `CAPTURE_BASELINE_MISSING`, `CAPTURE_BASELINE_MISMATCH`, `CAPTURE_IMAGE_SIZE_MISMATCH`, `CAPTURE_PROFILE_UNDECLARED`, `CAPTURE_RENDERER_UNEXPECTED`, `RENDER_INITIALIZATION_FAILED`, `RENDER_OPERATION_FAILED`, `RENDER_PARTICLE_CREATE_FAILED`, `RENDER_FRAME_FAILED`, `RENDER_RESIZE_FAILED`, `RENDER_DISPOSAL_FAILED`, `RENDER_VISUAL_DUPLICATE`, `RENDER_VISUAL_NOT_FOUND`, `RENDER_VISUAL_MATERIAL_UNSUPPORTED`, `RENDER_CONTEXT_LOST`, `SHADER_COMPILE_FAILED`.

## Consequências

- o gate visual da Fase 3 passa a ter evidência real do host, vinculada ao run e ao tick;
- nenhuma dependência nova de navegador entra no repositório;
- a distinção entre evidência semântica e evidência de pixels fica registrada no próprio artefato;
- baselines entram no Git e passam a exigir revisão intencional de imagem;
- cenários visuais precisam declarar quiescência, o que elimina uma classe inteira de teste intermitente;
- perfis e viewports suportados tornam-se lista fechada e auditável;
- captura em outro navegador, vídeo e profiling permanecem trabalho futuro, condicionado à revisão deste ADR.

## Alternativas rejeitadas

- **Adicionar Playwright ou Puppeteer:** dependência nova com download de navegador próprio, quando o Electron fixado já roda o mesmo bundle web que o jogo publica.
- **Exigir igualdade byte a byte:** falharia por driver, fonte e antialiasing sem qualquer defeito no jogo, e treinaria a sessão a ignorar falha visual.
- **Promover a captura SVG headless a evidência de pixels:** contradiz os ADRs 0010 e 0011 e alegaria suporte visual sem renderer real.
- **Capturar em ponto fixo de tempo:** produz intermitência dependente de máquina; quiescência declarada é a única condição reproduzível.
- **Guardar baselines fora do Git:** removeria a revisão intencional da imagem, que é o único ponto onde regressão visual é julgada.
- **Baseline única para todos os perfis:** esconderia defeito específico de viewport, escala de texto ou backend.
