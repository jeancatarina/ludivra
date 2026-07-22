# Backlog da fundação

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
| ENG-012 | alta | planejado | Implementar o control protocol local de desenvolvimento e teste |
| ENG-013 | média | planejado | Assinar e notarizar o pacote macOS após autorização e credenciais explícitas |
| ENG-014 | alta | planejado | Implementar scenario harness, captura e artifact bundle |
| ENG-015 | alta | planejado | Automatizar a sessão fria sobre o starter |

Ordem do marco corrente: `ENG-012` → `ENG-014` → `ENG-015`. O roadmap canônico está em [ROADMAP.md](ROADMAP.md).

Após o marco corrente, o backlog será detalhado uma fase por vez para o card roguelite, survivor-like, procedural indie sandbox, physics party brawler, procedural diorama builder e os cinco Forges. Esses marcos são obrigatórios pelo [ADR 0008](docs/adr/0008-mandatory-scale-and-procedural-capabilities.md), ainda que suas tarefas internas só sejam abertas quando a fase anterior passar pelo gate.
