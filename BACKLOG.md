# Backlog técnico da Ludivra

> Gerado de `docs/program-status.json` por `tools/program-status/generate.mjs`. Não edite manualmente.

Foco atual: **Fase 8 — Escalar renderer, UI, áudio e apresentação sem alterar autoridade de gameplay.**

| ID | Prioridade | Estado | Fase | Trabalho | ADRs |
|---|---|---|---:|---|---|
| AST-001 | alta | em andamento | 8 | Implementar ingestão, cooking, variantes, residência e streaming de assets por target. | [ADR 0049](docs/adr/0049-asset-ingest-cooking-and-residency.md) |
| RND-001 | alta | em andamento | 8 | Implementar materiais, shaders, ambiente e feature tiers com warmup e fallback. | [ADR 0050](docs/adr/0050-material-shader-environment-and-render-feature-tiers.md) |
| ANM-001 | alta | planejado | 8 | Implementar grafo de animação, retarget, IK, layers, masks e root motion controlado. | [ADR 0051](docs/adr/0051-animation-graph-and-skeletal-runtime.md) |
| VFX-001 | alta | planejado | 8 | Implementar VFX e partículas GPU/CPU com pooling, colisão, trails e budgets. | [ADR 0052](docs/adr/0052-textual-vfx-and-particle-runtime.md) |
| AUD-001 | alta | planejado | 10 | Completar música, stems, previews e integração final do Audio Forge. | [ADR 0032](docs/adr/0032-audio-forge-recipes-and-deterministic-renderer.md) |
| ENG-009 | média | planejado | 11 | Validar pacotes Windows e Linux em runners nativos. | [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md) |
| SUP-001 | média | planejado | 11 | Implementar registry e gate de CI para provenance, licença, upstream fixado e política de forks externos. | [ADR 0055](docs/adr/0055-upstream-first-and-external-source-incorporation.md) |
| ENG-013 | média | bloqueado | 11 | Assinar e notarizar o pacote macOS após autorização e credenciais explícitas. | [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md) |

Itens concluídos não permanecem no backlog. O estado entregue de cada fase está no [ROADMAP.md](ROADMAP.md), com evidência versionada; o histórico detalhado está no Git e nos manifests de `reports/runs/`.
