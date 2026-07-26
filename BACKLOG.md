# Backlog técnico da Ludivra

> Gerado de `docs/program-status.json` por `tools/program-status/generate.mjs`. Não edite manualmente.

Foco atual: **Fase 3 — Fechar os códigos específicos de renderer e shader e ampliar a matriz mínima de baselines.**

| ID | Prioridade | Estado | Fase | Trabalho | ADRs |
|---|---|---|---:|---|---|
| OBS-001 | alta | em andamento | 3 | Separar falhas de renderer e shader de erros genéricos de script. | [ADR 0010](docs/adr/0010-local-control-protocol-and-scenario-harness.md), [ADR 0015](docs/adr/0015-raster-capture-and-visual-baselines.md) |
| OBS-002 | alta | planejado | 3 | Aprovar a matriz mínima adicional de baselines raster. | [ADR 0015](docs/adr/0015-raster-capture-and-visual-baselines.md) |
| CNT-001 | alta | planejado | 4 | Implementar migrations explícitas do content pack e suas fixtures. | [ADR 0017](docs/adr/0017-content-pack-compilation-and-migrations.md) |
| SDK-001 | alta | planejado | 4 | Fechar o contrato versionado da camada 1 do SDK Lua, queries e projectors. | [ADR 0016](docs/adr/0016-public-lua-sdk-layers-and-escape-hatches.md) |
| WORLD-001 | alta | planejado | 5 | Adicionar jobs assíncronos, Simulation LOD e inspeção espacial após o gate da Fase 4. | [ADR 0019](docs/adr/0019-spatial-model-chunk-lifecycle-and-job-commit.md), [ADR 0045](docs/adr/0045-wasm-threads-and-shared-memory.md) |
| AUD-001 | alta | planejado | 10 | Completar música, stems, previews e integração final do Audio Forge. | [ADR 0032](docs/adr/0032-audio-forge-recipes-and-deterministic-renderer.md) |
| ENG-009 | média | planejado | 11 | Validar pacotes Windows e Linux em runners nativos. | [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md) |
| ENG-013 | média | bloqueado | 11 | Assinar e notarizar o pacote macOS após autorização e credenciais explícitas. | [ADR 0030](docs/adr/0030-target-hardening-signing-and-distribution.md) |

Itens concluídos não permanecem no backlog. O estado entregue de cada fase está no [ROADMAP.md](ROADMAP.md), com evidência versionada; o histórico detalhado está no Git e nos manifests de `reports/runs/`.
