# Decisões

| ADR | Status | Assunto |
|---|---|---|
| [0001](docs/adr/0001-build-system.md) | aceito | CMake, Ninja e pnpm |
| [0002](docs/adr/0002-runtime-c-abi.md) | provisório | C ABI mínima do runtime |
| [0003](docs/adr/0003-mit-license.md) | aceito | Licença MIT |
| [0004](docs/adr/0004-lua-sandbox.md) | aceito | Lua 5.4.8, sandbox e command buffer |
| [0005](docs/adr/0005-first-steam-delivery.md) | aceito | WebAssembly, Three.js, BrowserHost e pacote Electron/Steam |
| [0006](docs/adr/0006-desktop-commercial-host.md) | aceito | Host desktop, IPC, storage, diagnóstico e Steam opcional |
| [0007](docs/adr/0007-semantic-audio-and-effects.md) | aceito | Áudio, música e efeitos semânticos por eventos |
| [0008](docs/adr/0008-mandatory-scale-and-procedural-capabilities.md) | aceito | Capacidades obrigatórias de escala, multiplayer, construção e Forges |
| [0009](docs/adr/0009-canonical-state-and-run-evidence.md) | aceito | Estado canônico derivado, catálogo validado e evidência por execução |
| [0010](docs/adr/0010-local-control-protocol-and-scenario-harness.md) | aceito | Control protocol local, scenario harness e captura semântica |
| [0011](docs/adr/0011-card-roguelite-content-and-authority.md) | aceito | Vertical slice de card roguelite, conteúdo JSONC e autoridade Lua |
| [0012](docs/adr/0012-feature-first-roadmap-and-proof-games.md) | aceito | Roadmap por capacidades técnicas e jogos como provas finais |
| [0013](docs/adr/0013-development-runner-cache-and-lifecycle.md) | aceito | Cache por família de artefato, watch afetado e lifecycle de processos |
| [0014](docs/adr/0014-declarative-ui-contracts-and-initial-renderer.md) | aceito | `UiViewModel`, `RenderedUiSnapshot` e renderer de UI em DOM |
| [0015](docs/adr/0015-raster-capture-and-visual-baselines.md) | aceito | Captura raster pelo ElectronHost, tolerância e baselines versionadas |
| [0016](docs/adr/0016-public-lua-sdk-layers-and-escape-hatches.md) | provisório | Camadas do SDK Lua público, maturidade por símbolo e escape hatches |
| [0017](docs/adr/0017-content-pack-compilation-and-migrations.md) | provisório | Content pack derivado, container versionado, mapa de origem e migrations |
| [0018](docs/adr/0018-numeric-determinism-and-rng-streams.md) | provisório | Fixed-point com escala declarada e streams de PRNG por domínio |
| [0019](docs/adr/0019-spatial-model-chunk-lifecycle-and-job-commit.md) | provisório | Posição composta, identidade de chunk, lifecycle e commit determinístico de jobs |
| [0020](docs/adr/0020-presentation-buffers-and-wasm-memory.md) | provisório | Buffers de apresentação de registro fixo e leitura sem cópia no WASM |
| [0021](docs/adr/0021-motion-and-physics-adapter-authority.md) | provisório | Motion por tempo declarado e física por adapter com autoridade e quantização |
| [0022](docs/adr/0022-mass-runtime-storage-levels-and-budgets.md) | provisório | Arrays contíguos, cinco níveis de simulação e budgets de horda |
| [0023](docs/adr/0023-world-persistence-and-region-storage.md) | provisório | Region storage separado, journal atômico e mundo base regenerável |
| [0024](docs/adr/0024-player-hosted-multiplayer-and-protocol-compatibility.md) | provisório | Host-authoritative, transporte por adapter e compatibilidade N/N-1 |
| [0025](docs/adr/0025-audio-backends-voice-budgets-and-fallback.md) | provisório | Backend de áudio por host, budgets de voz e fallback observável |
| [0026](docs/adr/0026-construction-graph-as-source-of-truth.md) | provisório | Construction Graph autoritativo e compilação incremental por região |
| [0027](docs/adr/0027-forge-output-contract-and-authoring-boundary.md) | provisório | Manifest comum dos Forges, determinismo e fronteira de authoring |
| [0028](docs/adr/0028-diagnose-repair-verify-and-repair-classes.md) | provisório | Registro único de códigos, ciclo de reparo e classes de reparo |
| [0029](docs/adr/0029-benchmark-registry-profiles-and-baselines.md) | provisório | Registry de métricas, profiles, inconclusivo e baselines numéricas |
| [0030](docs/adr/0030-target-hardening-signing-and-distribution.md) | provisório | Assinatura por plataforma, smoke instalado e publicação autorizada |
| [0031](docs/adr/0031-native-diagnostic-host-trigger-and-criteria.md) | provisório | Gatilhos e critérios do `NativeDiagnosticHost` |
| [0032](docs/adr/0032-audio-forge-recipes-and-deterministic-renderer.md) | provisório | Audio Forge: receitas textuais e renderizador determinístico |
| [0033](docs/adr/0033-visual-forge-procedural-characters-and-generated-surfaces.md) | provisório | Visual Forge: personagens skeleton-first e superfícies geradas |
| [0034](docs/adr/0034-world-forge-textual-world-recipes.md) | provisório | World Forge: receitas de terreno, bioma e distribuição |
| [0035](docs/adr/0035-construction-forge-style-grammars.md) | provisório | Construction Forge: gramáticas de estilo arquitetônico |
| [0036](docs/adr/0036-physics-forge-collider-and-stability-recipes.md) | provisório | Physics Forge: collider derivado e cenários de estabilidade |
| [0037](docs/adr/0037-physics-solver-selection.md) | provisório | Jolt para 3D e Box2D v3 para 2D como vendor em adapter |
| [0038](docs/adr/0038-network-transport-adapters.md) | provisório | Loopback, WebRTC DataChannel e Steam Networking |
| [0039](docs/adr/0039-entity-component-layer.md) | provisório | Camada 2: handles geracionais, archetypes e queries declarativas |
| [0040](docs/adr/0040-ui-framework-and-diegetic-ui.md) | provisório | Nenhum framework de UI e limites da UI diegética |
| [0041](docs/adr/0041-c-abi-binding-mechanism.md) | provisório | Bindings da C ABI gerados de contrato único |
| [0042](docs/adr/0042-final-monorepo-layout.md) | provisório | Layout plano final do monorepo e categorias de pacote |
| [0043](docs/adr/0043-native-diagnostic-host-backend.md) | provisório | SDL3 como backend do `NativeDiagnosticHost` |
| [0044](docs/adr/0044-approved-native-extension-process.md) | provisório | Processo e fronteira de extensão nativa aprovada |
| [0045](docs/adr/0045-wasm-threads-and-shared-memory.md) | provisório | Versão 1 sem threads nem memória compartilhada no WASM |
