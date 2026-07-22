# ADR 0009 — Estado canônico derivado e evidência por execução

- Status: aceito
- Data: 2026-07-21
- Revisão: antes de alterar qualquer schema de operabilidade da versão 1

## Contexto

O starter mantém `PROJECT_STATE.json` manual, enquanto a arquitetura define `.ludivra/project-state.json` como índice derivado. O arquivo atual declara build e testes como `passing` sem commit, comando ou run correspondente. Os manifests de capability contêm apenas ID, versão e status. Somente `game test` grava um log, e nenhuma operação produz o manifest de evidência exigido pela arquitetura.

A Fase 0 precisa tornar estado, maturidade, limitações e evidências descobríveis sem criar vários índices concorrentes ou transformar relatórios gerados em fonte autoritativa.

## Decisão

### Estado do projeto

`.ludivra/project-state.json` será o único estado derivado do projeto. `game status --project <pasta>` o regenera a partir de `game.jsonc`, versão e estado Git da engine, catálogo de capabilities e manifests de runs compatíveis.

O arquivo seguirá `contracts/project-state.schema.json`, será ignorado pelo Git e poderá ser apagado e regenerado. `game new` produzirá o primeiro estado. O `AGENTS.md` do jogo mandará executar `game status` antes de ler o índice. Ausência ou invalidade será diagnóstico; nunca será convertida silenciosamente em `passing`.

### Evidência por execução

Toda invocação concluída da CLI gravará `reports/runs/<runId>/manifest.json` conforme `contracts/run-manifest.schema.json`. Quando houver projeto, o bundle pertence ao projeto; caso contrário, pertence à engine.

O manifest registrará comando, status, duração, versões, target, perfil, fingerprints Git, hashes dos contratos e dos artefatos. O próprio manifest não entra em sua lista interna de artefatos para evitar hash circular; o envelope da CLI o referencia com SHA-256.

Artefatos pesados e manifests locais permanecem ignorados pelo Git. Fixtures ou summaries escolhidos podem ser promovidos separadamente por mudança intencional.

### Catálogo de capabilities

Cada `capabilities/*/capability.json` seguirá `contracts/capability-manifest.schema.json` e declarará somente dados consumidos por inspeção e gates: owner, targets, contratos, exemplos, dependências, comandos de verificação e limitações.

`CAPABILITIES.json` continuará sendo exclusivamente gerado. O gerador validará schemas, referências, caminhos e IDs duplicados antes de escrever o catálogo.

### Fitness functions e CI

`game validate` verificará outputs gerados, schemas de operabilidade, imports públicos, dependências workspace declaradas, ciclos no grafo de pacotes e boundaries de vendor já definidos. A CI usará actions fixadas por SHA e uma matriz nativa para Linux, macOS e Windows; a equivalência WebAssembly rodará em job próprio com Emscripten fixado.

## Consequências

- `PROJECT_STATE.json` será removido e não terá compatibilidade paralela;
- status atual depende de fontes e evidências, não de edição manual;
- uma sessão pode encontrar a última evidência compatível ou receber ausência explícita;
- comandos da CLI passam a escrever somente dentro de `reports/runs` e `.ludivra` declarados;
- novos schemas e o comando `game status` fazem parte do contrato operacional da versão 0.5.0;
- falha ao gravar o manifest converte a operação em falha diagnosticada;
- CI comprova os boundaries disponíveis, sem alegar targets ou credenciais ausentes.

## Alternativas rejeitadas

- manter `PROJECT_STATE.json` manual: permite status sem evidência e duplica a arquitetura;
- criar um arquivo por índice: multiplica fontes derivadas e custo de sincronização;
- gravar manifests apenas em testes: deixa build, package, validate e doctor sem trilha;
- colocar o próprio manifest em sua tabela de hashes: cria dependência circular;
- inferir cycles apenas por imports individuais: não verifica o grafo público de pacotes;
- versionar todos os runs: infla o Git com artefatos efêmeros.
