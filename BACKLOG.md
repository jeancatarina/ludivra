# Backlog técnico da Ludivra

| ID | Prioridade | Estado | Trabalho |
|---|---|---|---|
| ENG-001 | alta | concluído | Fixar Lua e implementar sandbox mínima |
| ENG-002 | alta | concluído | Instalar Emscripten e provar equivalência native/WASM |
| ENG-003 | alta | concluído | Adicionar validação JSON Schema completa sem duplicar contratos |
| ENG-004 | alta | concluído | Automatizar todas as regras de imports e ciclos |
| ENG-005 | alta | concluído | Produzir artifact manifest por execução da CLI |
| ENG-006 | média | concluído | Adicionar CI com actions fixadas após configurar o remote GitHub |
| ENG-007 | alta | concluído | Implementar saves versionados, replay e equivalência native/WASM |
| ENG-008 | alta | concluído | Adicionar áudio abstrato, música e partículas ao vertical slice |
| ENG-009 | média | planejado | Validar pacotes Windows/Linux em runners nativos |
| ENG-010 | alta | concluído | Implementar storage/lifecycle/diagnóstico e adapters Steam opcionais no ElectronHost |
| ENG-011 | alta | concluído | Reconciliar `PROJECT_STATE.json` com o estado canônico definido pela arquitetura |
| ENG-012 | alta | concluído | Implementar o control protocol local de desenvolvimento e teste |
| ENG-013 | média | planejado | Assinar e notarizar o pacote macOS após autorização e credenciais explícitas |
| ENG-014 | alta | concluído | Implementar scenario harness, captura e artifact bundle |
| ENG-015 | alta | concluído | Automatizar a sessão fria sobre o starter |
| ENG-016 | alta | concluído | Implementar o card roguelite como fixture antecipada de gameplay, conteúdo e replay |
| ENG-017 | alta | planejado | Produzir UiViewModel e RenderedUiSnapshot reais no BrowserHost |
| ENG-018 | alta | planejado | Adicionar captura raster e cenário visual do BrowserHost usando a fixture card roguelite |
| ENG-019 | alta | planejado | Completar cache/watch incremental com invalidação explicável no Development Runner |
| ENG-020 | alta | planejado | Validar lifecycle, rebuild afetado e encerramento limpo do Development Runner |

Ordem restante do P0: `ENG-017` → `ENG-018` → `ENG-019` → `ENG-020`. O roadmap canônico está em [ROADMAP.md](ROADMAP.md).

Após esse gate, o backlog será detalhado por fundação técnica: autoria text-first, runtime espacial, motion/física/Mass Runtime, persistência mundial/multiplayer, apresentação escalável, construção, Forges e Diagnose–Repair–Verify. Os cinco jogos completos pertencem à prova integrada final definida pelo [ADR 0012](docs/adr/0012-feature-first-roadmap-and-proof-games.md).
