# ADR 0014 — Contratos de UI declarativa e renderer inicial

- Status: aceito
- Data: 2026-07-24
- Revisão: antes de adicionar dependência de framework de UI ou um segundo backend de UI
- Complementa: [ADR 0010](0010-local-control-protocol-and-scenario-harness.md) e [ADR 0011](0011-card-roguelite-content-and-authority.md)
- Fecha: item "renderer de UI inicial" da seção 36 de [architecture.md](../../architecture.md)
- Backlog: `ENG-017`

## Contexto

A arquitetura descreve `UiViewModel` como intenção semântica e `RenderedUiSnapshot` como resultado medido depois do layout, e afirma que payloads exibidos são contratos conceituais até serem promovidos por ADR e schema versionado. Essa promoção nunca aconteceu.

Hoje as duas estruturas existem como interfaces privadas dentro de `cli/src/control-worker.ts`, com `screen` fixo em `"game"`, `role` limitado a `button` e `status` e viewport literal `1280x720`. O harness em `cli/src/scenario-harness.ts` mantém uma terceira declaração parcial das mesmas formas para poder afirmar visibilidade de nó. São definições manuais paralelas de um modelo público, o que as regras de engenharia proíbem, e nenhuma delas é validada por schema.

O ADR 0010 registrou que `RenderedUiSnapshot` do BrowserHost é gate posterior, e o ADR 0011 registrou que a captura SVG headless não vale como evidência de pixels. Falta decidir o que o BrowserHost real produz, quem é o proprietário do contrato e qual backend renderiza a UI primeiro.

## Decisão

### Dois contratos versionados, não um

`UiViewModel` e `RenderedUiSnapshot` passam a ser contratos versionados em `contracts/ui-view-model.schema.json` e `contracts/rendered-ui-snapshot.schema.json`, com bindings gerados pelo mesmo mecanismo dos contratos existentes em `tools/contracts/`. O proprietário é `presentation-protocol`. As interfaces privadas do worker e a declaração parcial do harness são removidas e passam a consumir os bindings gerados.

A separação é normativa:

```text
kernel/Lua ──UiViewModel──> UI renderer ──RenderedUiSnapshot──> inspeção
                                 │
                              UiIntent
                                 ▼
                     kernel no próximo tick
```

- o produtor de `UiViewModel` é um projector read-only; ele não conhece bounds, pixels, fontes nem viewport;
- o produtor de `RenderedUiSnapshot` é o renderer; ele não decide existência de nó, texto de origem, ação permitida nem estado de jogo;
- fundir os dois em um payload é proibido, porque apagaria a diferença entre "o botão deveria existir" e "o botão apareceu e pode ser acionado".

### Campos mínimos

`UiViewModel`: tela, foco pretendido, e nós com ID estável, role semântico, chave de localização com parâmetros, estado, habilitação, seleção, navegação e ações permitidas. Texto já resolvido é proibido no ViewModel.

`RenderedUiSnapshot`: id do renderer, viewport, escala de texto, locale efetivo e, por nó, bounds, visibilidade, clipping, foco efetivo, texto resolvido, contraste e propriedades de acessibilidade.

`screen`, `role` e `renderer` são enumerações abertas por dados validados, não literais fixos no código. `renderer` é obrigatório e distingue no mínimo `headless-semantic-v1` e `browser-dom-v1`, para que evidência headless nunca seja lida como evidência do navegador.

IDs de nó são estáveis e determinísticos em função do estado lógico. ID derivado de posição de layout, de ordem de criação do DOM ou de contador de sessão é proibido.

### Renderer de UI inicial

O renderer inicial de UI é **DOM acessível no BrowserHost, sem framework de UI**.

A plataforma já fornece árvore de acessibilidade, foco, navegação por teclado, seleção de texto, IME, escala de texto e leitura por leitor de tela. Reimplementar isso em canvas antes de existir um consumidor que exija canvas seria custo sem evidência. A UI em canvas ou no renderer 3D permanece possível para elementos diegéticos, mas exige ADR próprio com o mesmo conjunto de propriedades de acessibilidade medidas.

Adicionar React, Vue ou equivalente exige ADR próprio pela regra de dependência de runtime. Este ADR não autoriza essa dependência.

### CSS e breakpoints

CSS registrado pelo host é apresentação, não contrato público. Nenhuma regra de gameplay, condição de habilitação ou decisão de ação pode viver em folha de estilo. Breakpoints, safe areas, escala de texto e tamanho mínimo de touch target são dados validados, não condicionais espalhadas.

Nomes de classe e seletores não entram em `UiViewModel` nem em `RenderedUiSnapshot`; o contrato permanece implementável por um renderer nativo.

### Localização

O ViewModel transporta chave e parâmetros. A resolução ocorre no host e aparece somente em `RenderedUiSnapshot`, junto do locale efetivo. Cenários fixam locale para obter evidência reproduzível. Chave sem tradução é diagnóstico, nunca fallback silencioso para a própria chave.

### Intents

O renderer só emite intents declarados pelo nó em `actions`. Um intent é aplicado no próximo tick pelo kernel, que valida autoridade e pode recusá-lo com diagnóstico. O renderer nunca muta estado autoritativo e nunca antecipa o efeito de um intent no ViewModel.

Códigos: `UI_NODE_ID_UNSTABLE`, `UI_INTENT_NOT_DECLARED`, `UI_LOCALE_KEY_MISSING`, `UI_NODE_NOT_RENDERED`, `UI_CONTRAST_BELOW_MINIMUM`, `UI_TOUCH_TARGET_TOO_SMALL`.

## Consequências

- as três declarações paralelas de hoje colapsam em dois contratos com bindings gerados e validadores;
- o harness passa a afirmar sobre nós por schema, não por forma parcial copiada;
- evidência headless e evidência do navegador tornam-se distinguíveis por campo obrigatório;
- a acessibilidade passa a ser verificável por dado, não por inspeção manual;
- `ENG-017` ganha critério de aceitação observável: o BrowserHost produz `browser-dom-v1` a partir do layout real;
- UI diegética em canvas e adoção de framework de UI passam a exigir ADR próprio;
- o kernel continua sem conhecer pixels, e o renderer continua sem autoridade sobre a regra.

## Alternativas rejeitadas

- **Um único payload de UI:** perde a distinção entre intenção e resultado medido, que é exatamente o defeito que o agente precisa diagnosticar.
- **Manter as interfaces privadas no worker:** são definições manuais paralelas de modelo público, sem schema, e já se multiplicaram para o harness.
- **UI em canvas ou no renderer 3D desde o início:** exigiria reimplementar acessibilidade, texto, foco e IME sem consumidor que justifique o custo.
- **Adotar framework de UI agora:** dependência de runtime sem necessidade medida, e acoplaria o contrato a um modelo de componente.
- **Derivar `UiViewModel` do DOM:** inverteria a direção das dependências e tornaria o renderer autoridade sobre o que existe.
- **Permitir texto resolvido no ViewModel:** esconderia chave ausente e tornaria o hash do estado dependente de locale.
- **IDs de nó posicionais:** quebrariam cenários e replays a cada mudança de layout.
