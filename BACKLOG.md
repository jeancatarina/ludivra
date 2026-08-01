# Backlog técnico da Ludivra

> Gerado de `docs/program-status.json` por `tools/program-status/generate.mjs`. Não edite manualmente.

Foco atual: **Fase 7 — Persistir regiões regeneráveis com journal atômico, recovery e migrations sem duplicar o mundo procedural.**

| ID | Prioridade | Estado | Fase | Trabalho | ADRs |
|---|---|---|---:|---|---|
| NET-005 | alta | em andamento | 7 | Localizar a primeira divergência remota por tick/chunk e publicar recuperação de estado sobre WebRTC/Steam, mantendo loopback como prova CI obrigatória. | [ADR 0024](docs/adr/0024-player-hosted-multiplayer-and-protocol-compatibility.md), [ADR 0038](docs/adr/0038-network-transport-adapters.md) |
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
