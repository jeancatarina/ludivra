# ADR 0047 — Perfis gráficos desktop e política de backend

- Status: provisório
- Data: 2026-07-26
- Revisão: após o primeiro benchmark oficial do perfil `desktop-high`, ou antes de adotar um renderer nativo de produção
- Complementa: [ADR 0005](0005-first-steam-delivery.md), [ADR 0015](0015-raster-capture-and-visual-baselines.md), [ADR 0029](0029-benchmark-registry-profiles-and-baselines.md), [ADR 0031](0031-native-diagnostic-host-trigger-and-criteria.md) e [ADR 0055](0055-upstream-first-and-external-source-incorporation.md)
- Fases: 8 e 11

## Contexto

O ElectronHost já empacota o renderer Three.js para Steam, mas isso prova distribuição, não um perfil gráfico desktop. A implementação atual usa WebGL2, primitivas simples, luzes fixas, fog exponencial, bloom e partículas CPU. Sem uma decisão de perfis, qualquer efeito novo vira uma opção isolada e fallback de backend pode mudar a imagem sem aparecer na evidência.

Godot foi analisada como referência de cobertura, não como arquitetura a copiar. A separação útil é entre método de renderização, driver e feature set; a Ludivra não adotará editor, scene tree, renderer ou abstração de GPU próprios.

Técnicas gráficas reutilizadas devem vir de Three.js, bibliotecas upstream, especificações ou papers originais. Código dos renderers da Godot não é fonte intermediária para portar uma técnica.

## Decisão

### Três perfis declarados

| Perfil | Host inicial | Método preferido | Obrigação |
|---|---|---|---|
| `web-compatible` | BrowserHost | WebGL2 | alcance e download controlado |
| `desktop-compatible` | ElectronHost | WebGL2 | desktop de menor capacidade e fallback declarado |
| `desktop-high` | ElectronHost | WebGPU | qualidade e escala para jogos 3D estilizados |

Perfil é parte do manifest, do run e da baseline. O jogo declara features obrigatórias e opcionais; o validator cruza essa declaração com a matriz do método efetivo antes do build.

O primeiro corte publica `RendererProfileRequest` no manifest v4 e resolve a matriz no `renderer-three` antes de construir o renderer. O BrowserHost expõe pedido/efetivo/método/adapter/motivo no inspection surface. `desktop-high` carrega `WebGPURenderer` sob demanda e o inicializa antes de aceitar o perfil; erro de API ou de init só prossegue em `desktop-compatible` quando esse fallback está declarado, emitindo `RENDER_METHOD_FALLBACK`; sem fallback ou com feature obrigatória ausente, a inicialização falha com código estável. O caminho WebGPU usa o render direto e tone mapping inicial; nome físico do adapter, timestamps GPU e pós-processamento WebGPU por tier continuam pendentes de smoke/benchmark, não uma alegação antecipada de cobertura completa.

### Fallback nunca é silencioso

WebGPU indisponível pode selecionar `desktop-compatible` somente quando o jogo declarar esse fallback. O run registra perfil pedido, perfil efetivo, método, adapter, GPU e motivo da troca. Feature obrigatória ausente falha com `RENDER_PROFILE_UNSUPPORTED`; aparência reduzida não é sucesso.

### Envelope inicial de `desktop-high`

O gate cobre cenas e prefabs compilados, glTF/GLB com PBR e animação, instancing, LOD, culling, sombras, ambiente e pós-processamento por tier, partículas GPU, gamepad, captura, métricas de GPU e pacote Steam verificável. Técnicas específicas como GI em tempo real, reflexos screen-space ou fog volumétrico só entram quando o perfil as declarar e possuir fallback ou incompatibilidade explícita.

### Renderer nativo continua condicionado a evidência

Electron, Three.js e WebGPU permanecem o caminho de produção desktop enquanto atingirem budgets aprovados. Um renderer nativo só entra no escopo após benchmark comparável demonstrar que o perfil exigido por um jogo de prova não cabe nesse caminho depois de otimizações atribuídas. Preferência tecnológica ou comparação genérica com outra engine não é gatilho.

Códigos: `RENDER_PROFILE_UNDECLARED`, `RENDER_PROFILE_UNSUPPORTED`, `RENDER_METHOD_FALLBACK`, `RENDER_FEATURE_REQUIRED_UNAVAILABLE`, `RENDER_GPU_PROFILE_UNVERIFIED`.

## Consequências

- Steam deixa de significar apenas “bundle web dentro do Electron” e passa a possuir níveis gráficos verificáveis;
- Browser e desktop podem compartilhar apresentação sem fingir que possuem o mesmo feature set;
- WebGPU é adotado no renderer existente antes de qualquer novo host de produção;
- a escolha futura de renderer nativo continua possível sem alterar gameplay, cenas ou assets semânticos;
- toda alegação gráfica passa a depender de matriz, baseline e benchmark do perfil efetivo.

## Alternativas rejeitadas

- **Copiar os renderers da Godot:** criaria uma engine gráfica própria e desviaria o programa do fluxo AI-first.
- **Adotar renderer nativo imediatamente:** dependência e segundo caminho de apresentação sem benchmark que os justifique.
- **Um perfil único para web e desktop:** reduz desktop ao menor denominador comum ou quebra web silenciosamente.
- **Fallback automático sem diagnóstico:** transforma incompatibilidade em regressão visual invisível.
