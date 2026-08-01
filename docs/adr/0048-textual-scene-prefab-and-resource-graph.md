# ADR 0048 — Scene, prefab e resource graph text-first

- Status: aceito
- Data: 2026-07-26
- Revisão: antes de estabilizar o primeiro schema de scene ou permitir herança além de uma base
- Complementa: [ADR 0017](0017-content-pack-compilation-and-migrations.md), [ADR 0039](0039-entity-component-layer.md) e [ADR 0047](0047-desktop-rendering-profiles-and-backend-policy.md)
- Fases: 4 e 8

## Contexto

O protocolo atual cria visuais por chamadas de apresentação, mas não existe fonte textual para compor um nível, personagem ou objeto reutilizável. Sem scene e prefab, cada jogo precisa escrever código imperativo para reconstruir hierarquia, transform, visual, collider, animação, luz, áudio e efeitos. Isso impede diff semântico, instanciação reutilizável e diagnóstico causal.

Uma árvore genérica de objetos como API pública também seria o erro oposto: exporia a implementação interna e convidaria gameplay a depender de nós de renderer.

## Decisão

### Fontes e compilação

`scenes/*.scene.jsonc` e `prefabs/*.prefab.jsonc` são fontes versionadas, validadas e compiladas para o content/asset pack. Produção não interpreta JSONC por frame.

Uma scene possui root explícito e instâncias com IDs estáveis. Um prefab é uma composição reutilizável com parâmetros e slots declarados. Instância pode aplicar overrides somente em campos marcados pelo schema. Existe no máximo uma base; composição por slots é preferida a cadeias de herança.

### Componentes públicos mínimos

O vocabulário inicial cobre transform hierárquico, visual, light, camera, audio emitter, VFX emitter, animation controller, physics body/collider, navigation contribution e spawn binding. Componentes referenciam IDs semânticos; classes de Three.js, caminhos físicos, objetos Jolt e detalhes de host são proibidos.

Scene não é o estado autoritativo do jogo. Ela descreve composição inicial e apresentação persistente. O compilador produz comandos de spawn e bindings para handles do runtime; mutações de gameplay continuam passando por comandos e eventos.

### Identidade, overrides e lifecycle

IDs são escritos explicitamente e não derivam de posição em array. Reordenar o documento não muda identidade. Override inexistente, tipo incompatível, referência cíclica e slot não preenchido falham antes do build.

Instanciação, ativação, desativação e descarte produzem trace com scene, prefab, instância, componente e origem. Recursos compartilhados possuem ownership e lifetime explícitos; remover uma instância não libera um recurso ainda referenciado.

### Nenhuma linguagem escondida

Scenes e prefabs não contêm callbacks, expressões ou scripts inline. Condições pertencem a Lua ou aos statecharts do ADR 0053; animação pertence ao ADR 0051. JSONC permanece dado validado.

Códigos: `SCENE_SCHEMA_INVALID`, `SCENE_ID_UNSTABLE`, `SCENE_REFERENCE_NOT_FOUND`, `SCENE_REFERENCE_CYCLE`, `PREFAB_OVERRIDE_FORBIDDEN`, `PREFAB_SLOT_UNRESOLVED`, `SCENE_COMPONENT_UNSUPPORTED`.

## Consequências

- um agente descreve níveis e objetos por diff textual sem editor;
- apresentação, física, animação e navegação passam a compartilhar identidade estável;
- prefabs eliminam código repetido sem expor ECS ou scene graph interno;
- o cooker pode carregar e descartar recursos por dependência real;
- os jogos de prova ganham uma unidade comum de composição sem uma API genérica de gênero.

## Implementação inicial

Os schemas `scene/v1` e `prefab/v1` declaram IDs explícitos, componentes públicos fechados, recursos semânticos, uma base opcional, parâmetros, overrides permitidos e slots. `content-compiler/src/scene-graph.ts` valida referências, ciclos, tipos de parâmetros, overrides e slots antes de normalizar o grafo por ID e adicioná-lo ao content pack como `ludivra.scene-graph`.

`game content inspect --scene <id>` expõe a cena compilada, enquanto `game content explain --symbol <scene>.<node>` aponta para a origem JSONC. Hosts ainda não instanciam esse grafo: o contrato de spawn, lifecycle e traces permanece uma entrega posterior.

## Alternativas rejeitadas

- **Adotar o SceneTree da Godot:** acoplaria gameplay a uma hierarquia de objetos e duplicaria internals.
- **Compor tudo em TypeScript:** torna a cena imperativa, difícil de validar e opaca para migrations.
- **Compor tudo em Lua:** mistura autoria visual com autoridade de gameplay.
- **Permitir script ou expressão no JSONC:** cria uma segunda linguagem sem sandbox e sem tooling.
- **IDs derivados da ordem:** qualquer edição estrutural quebraria saves, replays e cenários.
