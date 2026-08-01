# Backlog técnico da Ludivra

> Gerado de `docs/program-status.json` por `tools/program-status/generate.mjs`. Não edite manualmente.

Foco atual: **Fase 4 — Fechar o contrato versionado da camada 1 do SDK Lua, queries e projectors.**

| ID | Prioridade | Estado | Fase | Trabalho | ADRs |
|---|---|---|---:|---|---|
| SDK-001 | alta | em andamento | 4 | Fechar o contrato versionado da camada 1 do SDK Lua, queries e projectors. | [ADR 0016](docs/adr/0016-public-lua-sdk-layers-and-escape-hatches.md) |
| CNT-001 | alta | planejado | 4 | Implementar migrations explícitas do content pack e suas fixtures. | [ADR 0017](docs/adr/0017-content-pack-compilation-and-migrations.md) |
| FSM-001 | alta | planejado | 4 | Implementar statecharts determinísticas de gameplay com save, hash, replay e diagnóstico. | [ADR 0053](docs/adr/0053-deterministic-gameplay-statecharts.md) |
| SCN-001 | alta | planejado | 4 | Implementar schemas, compilação e inspeção do grafo textual de cenas e prefabs. | [ADR 0048](docs/adr/0048-textual-scene-prefab-and-resource-graph.md) |
| NAV-001 | alta | planejado | 5 | Implementar contratos de regiões, pathfinding, links, obstacles, agents e avoidance com fixture de benchmark. | [ADR 0054](docs/adr/0054-navigation-regions-pathfinding-and-avoidance.md) |
| WORLD-001 | alta | planejado | 5 | Adicionar jobs assíncronos, Simulation LOD e inspeção espacial após o gate da Fase 4. | [ADR 0019](docs/adr/0019-spatial-model-chunk-lifecycle-and-job-commit.md), [ADR 0045](docs/adr/0045-wasm-threads-and-shared-memory.md) |
| ANM-001 | alta | planejado | 8 | Implementar grafo de animação, retarget, IK, layers, masks e root motion controlado. | [ADR 0051](docs/adr/0051-animation-graph-and-skeletal-runtime.md) |
| AST-001 | alta | planejado | 8 | Implementar ingestão, cooking, variantes, residência e streaming de assets por target. | [ADR 0049](docs/adr/0049-asset-ingest-cooking-and-residency.md) |
| DESK-001 | alta | planejado | 8 | Implementar perfis gráficos desktop-compatible e desktop-high, seleção de backend e fallback observável. | [ADR 0047](docs/adr/0047-desktop-rendering-profiles-and-backend-policy.md) |
| RND-001 | alta | planejado | 8 | Implementar materiais, shaders, ambiente e feature tiers com warmup e fallback. | [ADR 0050](docs/adr/0050-material-shader-environment-and-render-feature-tiers.md) |
| VFX-001 | alta | planejado | 8 | Implementar VFX e partículas GPU/CPU com pooling, colisão, trails e budgets. | [ADR 0052](docs/adr/0052-textual-vfx-and-particle-runtime.md) |
| AUD-001 | alta | planejado | 10 | Completar música, stems, previews e integração final do Audio Forge. | [ADR 0032](docs/adr/0032-audio-forge-recipes-and-deterministic-renderer.md) |
| ENG-009 | média | planejado | 11 | Validar pacotes Windows e Linux em runners nativos. | [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md) |
| SUP-001 | média | planejado | 11 | Implementar registry e gate de CI para provenance, licença, upstream fixado e política de forks externos. | [ADR 0055](docs/adr/0055-upstream-first-and-external-source-incorporation.md) |
| ENG-013 | média | bloqueado | 11 | Assinar e notarizar o pacote macOS após autorização e credenciais explícitas. | [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md) |

Itens concluídos não permanecem no backlog. O estado entregue de cada fase está no [ROADMAP.md](ROADMAP.md), com evidência versionada; o histórico detalhado está no Git e nos manifests de `reports/runs/`.
