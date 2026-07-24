# ADR 0015 — Captura raster, baselines visuais e evidência de pixels

- Status: aceito
- Data: 2026-07-24
- Revisão: antes de aceitar um segundo backend de captura ou de prometer comparação entre backends
- Complementa: [ADR 0010](0010-local-control-protocol-and-scenario-harness.md) e [ADR 0014](0014-declarative-ui-contracts-and-initial-renderer.md)
- Backlog: `ENG-018`

## Contexto

A captura atual é SVG semântica produzida pelo adapter headless. O ADR 0010 aceitou essa captura como prova de composição, texto, bounds e vínculo com o estado, e recusou explicitamente tratá-la como equivalente aos pixels do Three.js. O ADR 0011 repetiu a recusa.

O gate da Fase 3 exige que, ao observar um defeito nos pixels do BrowserHost, a sessão consiga relacioná-lo ao estado lógico, à ação, ao evento e ao projector, reproduzi-lo por cenário e anexar evidência real ao artifact bundle. Isso exige captura raster do host real, com vínculo causal e critério de comparação — nenhum dos três existe.

Duas restrições delimitam a decisão. Pixels de GPU não são idênticos entre driver, sistema e máquina, portanto igualdade byte a byte não é um critério utilizável. E o repositório não possui navegador de automação: `electron@43.1.1` e `@electron/packager@20.0.3` já são dependências de desenvolvimento fixadas do ElectronHost, enquanto Playwright e Puppeteer não existem.

## Decisão

### Backend de captura

A captura raster do bundle web usa o **ElectronHost existente como adapter de captura**, por `webContents.capturePage`, em janela offscreen com viewport e escala declaradas.

Nenhum navegador de automação novo é adicionado. Se um defeito específico de um motor exigir captura em outro navegador, isso será um adapter novo com ADR próprio, não uma extensão silenciosa deste.

O adapter de captura é borda: ele não conhece regra de jogo e não decide quando capturar.

### Vínculo causal obrigatório

Toda captura carrega `runId`, tick, sequência, id do cenário, id do renderer conforme o ADR 0014, backend, perfil, viewport, escala de texto e locale efetivo.

A captura só ocorre depois de uma condição de quiescência declarada pelo cenário, usando `wait_for` do control protocol. Capturar sem condição declarada é proibido, porque produziria evidência que falha de forma intermitente sem defeito no jogo. Quiescência não atingida é `CAPTURE_NOT_QUIESCENT` e falha o cenário; nunca captura parcial silenciosa.

O bundle do run recebe a imagem, o `RenderedUiSnapshot` correspondente e o `capture-diff.json` quando houver baseline.

### Formato e comparação

O formato é PNG sem perda. A comparação **não** exige igualdade byte a byte. Cada perfil declara tolerância: fração máxima de pixels alterados, delta máximo por canal e regiões ignoradas quando houver conteúdo legitimamente variável.

O relatório de diff registra pixels alterados, delta máximo, caixas das regiões afetadas e a tolerância aplicada. Aprovar um diff sem relatório é proibido.

### Baselines

Baselines vivem versionadas em `tests/baselines/<scenario>/<backend>/<profile>/<viewport>.png`, uma por combinação declarada. Capturas de execução permanecem no bundle do run ignorado pelo Git.

Baseline ausente é `CAPTURE_BASELINE_MISSING` e classifica o item como `NOT_AVAILABLE`, nunca `PASS`. Atualização de baseline só ocorre por mudança intencional que carregue o relatório de diff no mesmo change set.

Combinação sem baseline aprovada não pode ser alegada como suporte visual, seguindo a regra da target matrix.

### O que continua fora

A captura SVG headless permanece válida como evidência de composição e semântica e continua proibida como evidência de pixels. Este ADR não promete comparação entre backends diferentes, captura de vídeo, profiling de GPU nem baseline por máquina de desenvolvedor.

Códigos: `CAPTURE_RASTER_UNAVAILABLE`, `CAPTURE_NOT_QUIESCENT`, `CAPTURE_BASELINE_MISSING`, `CAPTURE_BASELINE_MISMATCH`, `CAPTURE_PROFILE_UNDECLARED`.

## Consequências

- o gate visual da Fase 3 passa a ter evidência real do host, vinculada ao run e ao tick;
- nenhuma dependência nova de navegador entra no repositório;
- a distinção entre evidência semântica e evidência de pixels fica registrada no próprio artefato;
- baselines entram no Git e passam a exigir revisão intencional de imagem;
- cenários visuais precisam declarar quiescência, o que elimina uma classe inteira de teste intermitente;
- perfis e viewports suportados tornam-se lista fechada e auditável;
- captura em outro navegador, vídeo e profiling permanecem trabalho futuro com ADR próprio.

## Alternativas rejeitadas

- **Adicionar Playwright ou Puppeteer:** dependência nova com download de navegador próprio, quando o Electron fixado já roda o mesmo bundle web que o jogo publica.
- **Exigir igualdade byte a byte:** falharia por driver, fonte e antialiasing sem qualquer defeito no jogo, e treinaria a sessão a ignorar falha visual.
- **Promover a captura SVG headless a evidência de pixels:** contradiz os ADRs 0010 e 0011 e alegaria suporte visual sem renderer real.
- **Capturar em ponto fixo de tempo:** produz intermitência dependente de máquina; quiescência declarada é a única condição reproduzível.
- **Guardar baselines fora do Git:** removeria a revisão intencional da imagem, que é o único ponto onde regressão visual é julgada.
- **Baseline única para todos os perfis:** esconderia defeito específico de viewport, escala de texto ou backend.
