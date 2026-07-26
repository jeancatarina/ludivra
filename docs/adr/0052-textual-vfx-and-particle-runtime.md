# ADR 0052 — VFX text-first e runtime de partículas

- Status: provisório
- Data: 2026-07-26
- Revisão: após o primeiro efeito GPU aprovado ou antes de adicionar módulo de VFX fora do vocabulário fechado
- Complementa: [ADR 0007](0007-semantic-audio-and-effects.md), [ADR 0047](0047-desktop-rendering-profiles-and-backend-policy.md) e [ADR 0050](0050-material-shader-environment-and-render-feature-tiers.md)
- Fase: 8

## Contexto

O protocolo atual suporta apenas `spawn_effect` mapeado para um burst de pontos atualizado na CPU. Isso não cobre emissores persistentes, curvas, trails, subemitters, colisão, pooling ou profiles de GPU. Adicionar parâmetros ao burst indefinidamente criaria um pseudo-sistema sem composição nem budget.

## Decisão

### Receita fechada e compilada

`effects/*.vfx.jsonc` declara emitters, lifetime, spawn shape, rate/burst, velocity, forces, color/size/rotation curves, renderer, material, trails, subemitters e política de colisão. O vocabulário é fechado por schema; script e shader inline são proibidos.

Eventos semânticos continuam sendo a única entrada de gameplay. Um evento referencia recipe ID, transform, seed e parâmetros permitidos. A recipe compilada é asset; o evento não transporta grafo nem caminho físico.

### Métodos por perfil

`desktop-high` prefere simulação GPU. `desktop-compatible` e `web-compatible` podem usar GPU reduzida ou CPU bounded conforme capability. Fallback preserva identidade semântica — efeito, duração e causa — mas não promete partículas idênticas.

Emitter declara contagem máxima, memória, overdraw class, prioridade e política de degradação. Pooling é obrigatório para recursos recorrentes. Estouro reduz apenas apresentação segundo ordem estável e registra o que foi cortado.

### Colisão e autoridade

Partículas podem colidir com depth, height field, SDF ou proxies de física conforme o perfil. Resultado de partícula nunca cria dano, item ou estado de gameplay. Efeito de gameplay produz primeiro o evento lógico e depois o VFX correspondente.

### Evidência

Trace registra recipe, emitter, partículas vivas, spawns, cortes, pool hits, tempo CPU/GPU e fallback. Validação dinâmica usa sequência ou vídeo com seed e profile fixos. Screenshot isolado não prova lifetime, trail ou subemitter.

Códigos: `VFX_RECIPE_INVALID`, `VFX_MODULE_UNSUPPORTED`, `VFX_PROFILE_FALLBACK`, `VFX_PARTICLE_BUDGET_EXCEEDED`, `VFX_POOL_EXHAUSTED`, `VFX_COLLISION_UNAVAILABLE`, `VFX_GAMEPLAY_AUTHORITY_VIOLATION`.

## Consequências

- partículas deixam de ser uma função especial do renderer;
- efeitos são criáveis e revisáveis por texto;
- GPU, CPU e fallback compartilham recipe e diagnóstico;
- budgets impedem que VFX degrade frame sem responsável;
- gameplay continua independente da quantidade de partículas visíveis.

## Alternativas rejeitadas

- **Ampliar indefinidamente `ParticleBurst`:** não expressa composição, lifecycle nem recursos.
- **Editor visual de VFX:** contradiz o fluxo principal e cria estado opaco.
- **Script por partícula:** custo e não determinismo incompatíveis com os profiles.
- **Colisão de partícula decidir dano:** transforma apresentação em autoridade.
- **Mesmo número de partículas em todo hardware:** quebra budget em vez de degradar apresentação.
