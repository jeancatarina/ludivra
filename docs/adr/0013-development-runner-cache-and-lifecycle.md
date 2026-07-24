# ADR 0013 — Cache incremental, watch e lifecycle do Development Runner

- Status: aceito
- Data: 2026-07-24
- Revisão: ao fechar o gate da Fase 2 ou antes de adicionar qualquer família de artefato nova
- Complementa: [ADR 0009](0009-canonical-state-and-run-evidence.md) e [ADR 0010](0010-local-control-protocol-and-scenario-harness.md)
- Backlog: `ENG-019` e `ENG-020`

## Contexto

O gate da Fase 2 exige que uma sessão execute, interrompa, reconstrua e inspecione um projeto com caches que declaram a causa de hit/miss e sem deixar processos órfãos. Nenhuma das três partes existe.

`game build` e `game run` executam `build:packages` e `build:wasm` em toda invocação, sem consultar entrada, hash ou artefato anterior. `runProcess` apenas encaminha `spawn`: não há timeout, grupo de processo, terminação de árvore nem registro de filhos. `game run` entrega o servidor de desenvolvimento em modo `interactive` e delega o encerramento ao terminal, o que torna o resultado dependente de como a sessão foi interrompida.

Duas peças reutilizáveis já existem e não devem ser reimplementadas: `sha256`/`hashArtifactPath` em `cli/src/artifact-hash.ts` e o manifest por execução definido pelo ADR 0009. O worker de controle do ADR 0010 já possui token, timeout e shutdown próprios para o processo filho de controle.

Cache é uma dependência de infraestrutura que as regras de engenharia só autorizam com necessidade medida. A necessidade aqui não é desempenho subjetivo: é o gate de operabilidade, que exige invalidação explicável como dado inspecionável.

## Decisão

### Unidade de cache

A unidade é a **família de artefato**, não o arquivo nem o comando. Cada família declara id, entradas, saídas e dependências:

```text
contracts ──> packages ──> wasm ──> web-bundle
                      └──> native
content
```

`content` cobre validação de `game.jsonc`, schemas e documentos do projeto. Não haverá cache por arquivo individual, por comando arbitrário nem por invocação inteira da CLI.

### Chave de cache

A chave é `sha256` sobre, nesta ordem: `cacheFormatVersion`, id da família, hashes ordenados das entradas obtidos por `hashArtifactPath`, fingerprint de `toolchain.lock`, hashes dos contratos gerados que a família consome e as variáveis de ambiente declaradas pela família — hoje target, base e caminho relativo do projeto.

Nenhuma outra fonte entra na chave. `mtime`, tamanho, ordem de leitura do sistema de arquivos e relógio civil são proibidos como sinal de invalidação. Uma segunda implementação de hash de artefato é proibida: `cli/src/artifact-hash.ts` é o proprietário.

### Local e regime do cache

O cache vive em `.ludivra/cache/<family>/<key>/`, na raiz da engine para famílias da engine e no projeto para famílias do projeto. Ele segue o regime de dado derivado do ADR 0009: ignorado pelo Git, apagável, regenerável e nunca fonte de verdade.

Hoje `.gitignore` ignora apenas `**/.ludivra/project-state.json`. A implementação DEVE acrescentar `**/.ludivra/cache/` no mesmo change set que criar a primeira família; cache versionado é rejeição automática por artefato gerado no repositório.

Apagar o cache pode alterar apenas a duração da operação, nunca os bytes de saída. Essa é uma propriedade verificável: um cenário reconstrói a mesma família com cache frio e quente e compara os hashes dos artefatos.

### Hit e miss explicáveis

Cada família reporta `status` `hit` ou `miss`. Todo miss carrega uma razão de um conjunto fechado:

`NO_ENTRY`, `INPUT_CHANGED`, `TOOLCHAIN_CHANGED`, `CONTRACT_CHANGED`, `CACHE_FORMAT_CHANGED`, `OUTPUT_MISSING`, `FORCED`.

`INPUT_CHANGED` lista as entradas que mudaram, truncadas por `--max-diagnostics` sem perder o total de ocorrências. Razão indeterminada é diagnóstico `CACHE_REASON_UNAVAILABLE` e força miss; hit silencioso ou reuso sem causa registrada é proibido.

As decisões de cache de uma execução são gravadas como artefato `cache-decisions.json` no bundle do run e referenciadas pelo manifest existente. `contracts/run-manifest.schema.json` não muda.

### Watch e rebuild afetado

`game build --watch` e `game run --watch` mapeiam arquivo alterado para a família proprietária e reconstroem essa família e apenas seus dependentes declarados. O debounce é declarado e coalesce eventos do mesmo intervalo.

Uma sessão de watch é **uma** invocação e portanto um único run manifest, preservando o ADR 0009. Cada rebuild acrescenta uma linha a `rebuilds.jsonl` dentro do bundle do run, com sequência, arquivos disparadores, famílias reconstruídas, razão de invalidação, duração e status. Um run por rebuild é proibido: inflaria `reports/runs` e tornaria a evidência da sessão ilegível.

Watch não valida parcialmente em silêncio e não publica artefato cuja família não tenha sido reconstruída na mesma sessão.

### Propriedade do lifecycle

`cli/src/process-runner.ts` passa a ser o único dono de criação de processo na CLI e a exigir, por processo: id, timeout obrigatório ou `unbounded` declarado explicitamente, grupo de processo próprio que permita terminação de árvore, `SIGTERM` com prazo declarado seguido de `SIGKILL`, liberação de porta e registro em uma tabela de filhos vivos.

A CLI termina todos os filhos ao encerrar, inclusive em caminho de erro e ao receber sinal. O worker de controle do ADR 0010 conserva token e handshake, mas passa a ser criado por esse mesmo dono; um segundo caminho de shutdown é proibido.

Códigos: `RUNNER_CHILD_TIMEOUT`, `RUNNER_CHILD_KILLED`, `RUNNER_CHILD_ORPHANED`, `RUNNER_PORT_UNAVAILABLE`, `RUNNER_SHUTDOWN_INCOMPLETE`.

### Fora do escopo

Esta decisão não cria daemon, servidor de build, cache remoto ou compartilhado entre máquinas, nem adota um orquestrador de build de terceiros.

## Consequências

- `game build` e `game run` deixam de reconstruir tudo em toda invocação;
- o gate da Fase 2 passa a ser verificável por dado, não por impressão de velocidade;
- toda reutilização de artefato possui causa inspecionável no bundle do run;
- `.ludivra/cache` entra no regime de derivado ignorado pelo Git, junto de `project-state.json`;
- o watch exige o grafo de dependências entre famílias declarado explicitamente, não inferido;
- criação de processo passa a ter um proprietário único, e o control worker perde seu caminho paralelo de encerramento;
- famílias novas exigem entradas, saídas e dependências declaradas antes de existirem, o que revisa este ADR.

## Alternativas rejeitadas

- **Invalidação por timestamp:** `mtime` muda em checkout, cópia e restauração sem que o conteúdo mude, e não muda em edições que preservam o tempo; produziria hit falso e miss falso no mesmo dia.
- **Adotar um orquestrador de build de terceiros:** adicionaria dependência de toolchain sem cobrir WebAssembly, build nativo e validação de conteúdo, que são justamente as famílias caras.
- **Daemon persistente:** move estado para fora da invocação, cria ciclo de vida invisível ao run manifest e reintroduz o problema de processo órfão que este ADR resolve.
- **Cache por arquivo:** granularidade sem proprietário, com grafo de dependências implícito e milhares de entradas para justificar cada decisão.
- **Um run manifest por rebuild em watch:** transformaria uma sessão de uma hora em centenas de runs e destruiria a legibilidade de `reports/runs`.
- **Cache sem razão registrada:** entrega velocidade e retira a única propriedade que o gate exige.
- **Manter o encerramento no terminal:** deixa porta ocupada e processo vivo depois de a CLI retornar, e torna o resultado dependente do modo de interrupção.
