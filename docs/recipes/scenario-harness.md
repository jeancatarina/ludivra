# Cenários, controle e evidência

O harness da Ludivra executa cenários JSONC por um worker local controlado pela CLI. O transporte é stdio, cada execução recebe token efêmero e somente operações previstas em `contracts/control-protocol.schema.json` são aceitas.

## Executar o starter

```sh
pnpm game -- context --task "reproduzir o cenário de carga" --format json
pnpm game -- simulate \
  --project examples/first-game \
  --scenario scenarios/charge-core.jsonc \
  --format json
```

O run contém:

```text
reports/runs/<run-id>/
├── manifest.json
├── summary.md
├── scenario.jsonc
├── commands.json
├── diagnostics.json
├── metrics.json
├── logical-state.json
├── ui-view-model.json
├── rendered-ui-snapshot.json
├── traces/causal-trace.json
├── replays/<scenario>.lreplay
└── screenshots/<capture>.svg
```

## Reproduzir e relatar

Use os caminhos devolvidos por `simulate`:

```sh
pnpm game -- replay \
  --project examples/first-game \
  --scenario scenarios/charge-core.jsonc \
  --replay reports/runs/<run-id>/replays/starter.charge-core.lreplay \
  --format json

pnpm game -- report \
  --project examples/first-game \
  --run <run-id> \
  --format json
```

`report` cria outro run e não modifica a evidência de origem.

## Limites

- steps e assertions são uniões fechadas; não há expressões executáveis;
- paths são resolvidos dentro do projeto;
- timeout ou encerramento inesperado do worker falha com diagnóstico estruturado;
- a captura SVG comprova o renderer semântico headless, não pixels do BrowserHost;
- o estágio causal `command` representa o diff de estado comprometido e não expõe instruções privadas da Lua.
