# Análise de lacunas para jogos desktop a partir da Godot

> Referência de capacidades para a Ludivra; não é plano de implementação nem fonte de status.

| Campo | Valor |
|---|---|
| Data da análise | 2026-07-26 |
| Snapshot da Godot | [`159701651ad44335691dcbd632d8074307074c7b`](https://github.com/godotengine/godot/commit/159701651ad44335691dcbd632d8074307074c7b) |
| Fonte de progresso da Ludivra | [`docs/program-status.json`](../program-status.json) |
| Fonte de decisões | ADRs em [`docs/adr/`](../adr/) |
| Política de reuso | [ADR 0055](../adr/0055-upstream-first-and-external-source-incorporation.md) |

## Pergunta respondida

A análise não procura transformar a Ludivra em uma implementação menor da Godot. Ela usa a Godot como referência madura para responder quais contratos faltam para que um jogo text-first possa chegar ao desktop/Steam com boa qualidade gráfica, física, animação, VFX, fog, state machines, navegação e operação confiável.

A Godot separa rendering method, rendering driver e backend; oferece um renderer avançado para desktop e outro compatível para hardware/web. Essa distinção é mais útil para a Ludivra que copiar qualquer implementação concreta. A [comparação oficial de renderers](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html) também mostra que fallback pode mudar a aparência, portanto precisa ser observado e testado.

## Matriz de lacunas e decisões

| Área observada na Godot | Contrato necessário na Ludivra | Decisão |
|---|---|---|
| Renderers e drivers com feature sets diferentes | perfis gráficos com método solicitado/efetivo e fallback diagnosticado | [ADR 0047](../adr/0047-desktop-rendering-profiles-and-backend-policy.md) |
| Scene tree, cenas instanciáveis e resources | cenas e prefabs textuais, IDs estáveis, composição e compilação sem editor | [ADR 0048](../adr/0048-textual-scene-prefab-and-resource-graph.md) |
| Importadores, reimportação e formatos 3D | ingestão glTF/GLB, cooking por target, LOD, compressão, residência e streaming | [ADR 0049](../adr/0049-asset-ingest-cooking-and-residency.md) |
| PBR, toon, luzes, sombras, sky, fog e pós-processamento | modelos semânticos e feature tiers com fallback; nenhuma linguagem de shader própria | [ADR 0050](../adr/0050-material-shader-environment-and-render-feature-tiers.md) |
| AnimationPlayer e AnimationTree | clips, blends 1D/2D, layers, masks, one-shots, state machine visual, retarget e IK | [ADR 0051](../adr/0051-animation-graph-and-skeletal-runtime.md) |
| Partículas GPU/CPU, trails, subemitters e colisão | grafo VFX textual, perfis GPU/CPU, pooling, budgets e evidência dinâmica | [ADR 0052](../adr/0052-textual-vfx-and-particle-runtime.md) |
| State machines usadas por lógica de jogo | statecharts autoritativas, determinísticas, persistíveis e sem expressão embutida | [ADR 0053](../adr/0053-deterministic-gameplay-statecharts.md) |
| Navigation maps, regions, agents, links e avoidance | contrato independente de backend, baking por chunks e commit em tick boundary | [ADR 0054](../adr/0054-navigation-regions-pathfinding-and-avoidance.md) |
| Corpos, áreas, joints, character bodies, ragdolls e interpolação | ampliar o contrato físico sem criar solver próprio | [ADR 0021](../adr/0021-motion-and-physics-adapter-authority.md) e [ADR 0037](../adr/0037-physics-solver-selection.md) |
| Áudio espacial e buses | spatial intent, sends, reverb/occlusion, streaming, voice e memory budgets | [ADR 0025](../adr/0025-audio-backends-voice-budgets-and-fallback.md) |
| Export e execução por plataforma | target matrix por sistema, hardware, driver, perfil gráfico e smoke instalado | [ADR 0030](../adr/0030-target-hardening-signing-and-distribution.md) |

A lista oficial de features da Godot foi usada como checklist de cobertura — PBR, iluminação, fog, partículas, pós-processamento, física e navegação — e não como requisito de paridade de implementação: [Godot feature list](https://docs.godotengine.org/en/stable/about/list_of_features.html). Para animação, a referência foi a separação entre clips e o grafo de blending/transições descrita em [AnimationTree](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html). Para assets, a referência foi o pipeline configurável de [importação de cenas 3D](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/index.html).

## O que não será copiado

- editor visual, inspector, SceneTree e modelo de scripts anexados a nodes;
- RenderingServer, RenderingDevice, renderers Forward+/Mobile/Compatibility ou abstração própria de GPU;
- linguagem de shader, linguagem de gameplay ou formato binário de cena da Godot;
- engine física, navegação ou sistema de partículas próprios;
- APIs cuja principal finalidade seja dar suporte ao editor.

Esses componentes resolvem problemas legítimos da Godot, mas aumentariam a superfície que uma engine AI-first precisa manter. Na Ludivra, autoria permanece em JSONC/Lua, compiladores e CLI; Three.js continua isolado em `renderer-three`; Jolt e Box2D ficam em adapters; um backend de navegação só será escolhido quando consumidor e benchmark existirem.

## O que será reutilizado e de onde

| Necessidade | Fonte | Forma de reuso |
|---|---|---|
| cobertura e casos extremos | documentação, casos cobertos e comportamento da Godot | requisitos e cenários próprios, sem copiar implementação |
| física 3D | upstream Jolt Physics | dependência fixada e adapter Ludivra |
| física 2D | upstream Box2D v3 | dependência fixada e adapter Ludivra |
| render WebGPU/WebGL2 | upstream Three.js | único adapter em `renderer-three` |
| navegação | upstream escolhido após benchmark, com Recast/Detour como candidato | adapter Ludivra; não usar `NavigationServer` |
| glTF, texturas e meshes | loaders, encoders e optimizers upstream escolhidos pelo cooker | ferramenta fixada; não copiar importers da Godot |
| algoritmos gráficos | especificação, paper ou upstream original | implementação do adapter ou dependência, nunca port indireto do renderer Godot |
| contratos, authority e tooling AI-first | Ludivra | implementação própria |

A integração Jolt da Godot é útil para conhecer diferenças de margins, joints, contacts e threading, mas implementa `PhysicsServer` e compatibilidade da Godot. A Ludivra usa diretamente as APIs upstream e escreve seus próprios testes contra o ADR 0021. A [documentação oficial de Jolt na Godot](https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html) é referência de comportamento, não fonte de adapter.

Embora o código da Godot seja MIT, copiar porções substanciais exige preservar licença e copyright, além dos notices das dependências incluídas. A permissão jurídica não elimina custo de manutenção ou acoplamento: [orientação oficial de licenciamento da Godot](https://docs.godotengine.org/en/stable/about/complying_with_licenses.html).

Trecho pequeno existente somente na Godot ainda precisa do gate excepcional do ADR 0055. Até `SUP-001` implementar provenance executável e verificação de CI, nova incorporação de fonte é `NOT_AVAILABLE`.

## Critério de equivalência útil

“Mesmo nível” não significa mesma lista de algoritmos ou pixel idêntico. Para a Ludivra, significa:

1. o jogo declara um perfil e falha cedo quando depende de feature indisponível;
2. cenas, assets, animações, VFX e statecharts são criáveis e revisáveis por texto;
3. o runtime possui física, navegação, áudio e apresentação suficientes para os jogos de prova;
4. cada feature visual tem fallback explícito ou incompatibilidade declarada;
5. qualidade dinâmica é comprovada por vídeo/frames, métricas CPU/GPU e smoke no hardware alvo;
6. um jogo que não usa a capability não paga seu custo relevante.

O backlog executável e a ordem de implementação são gerados em [`BACKLOG.md`](../../BACKLOG.md) e [`ROADMAP.md`](../../ROADMAP.md). Esta nota deve ser revisada quando um jogo de prova revelar uma lacuna que não caiba nos contratos acima, ou quando uma comparação por benchmark justificar renderer nativo de produção.
