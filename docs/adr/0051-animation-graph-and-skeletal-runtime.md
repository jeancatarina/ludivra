# ADR 0051 — Animation Graph e runtime esquelético

- Status: provisório
- Data: 2026-07-26
- Revisão: após o primeiro personagem controlável com blend e antes de permitir animação com autoridade de gameplay
- Complementa: [ADR 0020](0020-presentation-buffers-and-wasm-memory.md), [ADR 0021](0021-motion-and-physics-adapter-authority.md), [ADR 0033](0033-visual-forge-procedural-characters-and-generated-surfaces.md) e [ADR 0049](0049-asset-ingest-cooking-and-residency.md)
- Fase: 8

## Contexto

O Visual Forge já produz rig, skin e clips, mas o runtime não os carrega nem mistura. `AnimationStateBuffer` existe apenas como intenção arquitetural. Sem um contrato, cada presenter precisaria controlar clips diretamente e misturaria timing visual com regras de combate ou movimento.

## Decisão

### Fontes e vocabulário

`animations/*.graph.jsonc` declara um grafo versionado. Clips vêm de assets cozidos e são referenciados por ID. O vocabulário inicial fechado possui `clip`, `blend1d`, `blend2d`, `layer`, `mask`, `one-shot`, `state-machine` e `output`. Não há callback ou expressão inline.

Parâmetros do grafo são valores tipados projetados do estado lógico — boolean, integer, fixed-to-float e enum ID. O renderer avalia pose, blend e interpolação em tempo de apresentação.

### Skeleton, retarget e modificadores

Skeleton possui hierarquia, rest pose, bind pose e nomes semânticos versionados. Import e Forge normalizam clips para essa forma. Retarget registra mapa, escala e ossos ausentes; incompatibilidade não é correção silenciosa.

IK, look-at, aim, spring bones e morph targets são modificadores de apresentação. Eles não alteram collider, hitbox ou estado autoritativo sem um sistema lógico separado.

### State machine de animação não é statechart de gameplay

Transições de animação escolhem poses. Estado de combate, AI, interação e vitória pertence ao ADR 0053. Um marker visual pode emitir evento de apresentação; dano, janela de parry e consumo de recurso usam timer/evento lógico e apenas projetam seu estado para a animação.

### Root motion

Root motion importado pode orientar uma intenção visual ou fornecer amostra para authoring. Ele não escreve diretamente no corpo de gameplay. Movimento autoritativo usa os comandos e tempos do ADR 0021; o Animation Graph consome velocidade, direção e fase confirmadas para manter os pés coerentes.

### Evidência e buffers

O runtime expõe graph ID, node ativo, pesos, clip/time normalizado, markers, pose hash e causa de transição. Captura dinâmica usa vídeo ou sequência, nunca apenas frame isolado. Buffers transportam estado e parâmetros; matrizes de ossos podem ser produzidas no renderer ou em buffer dedicado conforme benchmark, sem entrar no save.

Códigos: `ANIMATION_GRAPH_INVALID`, `ANIMATION_CLIP_NOT_FOUND`, `ANIMATION_SKELETON_INCOMPATIBLE`, `ANIMATION_RETARGET_INCOMPLETE`, `ANIMATION_TRANSITION_UNRESOLVED`, `ANIMATION_GAMEPLAY_AUTHORITY_VIOLATION`, `ANIMATION_POSE_BUDGET_EXCEEDED`.

## Consequências

- personagens gerados e importados usam o mesmo runtime;
- locomotion, one-shots e camadas deixam de ser lógica imperativa no presenter;
- timing visual permanece desacoplado de dano e física;
- o agente consegue inspecionar por que uma pose foi escolhida;
- animação ganha gate dinâmico e budget próprio.

## Alternativas rejeitadas

- **Controlar clips diretamente em cada jogo:** duplica transições e impede inspeção comum.
- **Usar animação para decidir gameplay:** torna frame rate e renderer autoridades.
- **Copiar AnimationTree da Godot:** importa uma API e modelo de nodes que não pertencem à Ludivra.
- **Bakar toda combinação de pose:** explode conteúdo e elimina blend responsivo.
- **Permitir expressão livre em transições:** cria linguagem escondida e difícil de reproduzir.
