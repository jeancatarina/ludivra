# ADR 0046 — Estado do programa estruturado e documentação derivada

- Status: aceito
- Data: 2026-07-25
- Revisão: antes de criar outro índice de progresso ou outra fonte de backlog
- Complementa: [ADR 0009](0009-canonical-state-and-run-evidence.md) e [ADR 0012](0012-feature-first-roadmap-and-proof-games.md)

## Contexto

`ROADMAP.md`, `BACKLOG.md`, `DECISIONS.md`, `SESSION_REPORT.md`, relatórios de exemplos e manifests de capability passaram a repetir status, entregas e limitações. Cada arquivo era internamente razoável, mas atualizá-los no mesmo change set dependia de memória humana. O resultado foi contraditório: o content pack existia enquanto o catálogo ainda declarava `CONTENT_PACK_NOT_IMPLEMENTED`, tarefas concluídas continuavam planejadas e o roadmap apontava para uma prioridade anterior.

O ADR 0009 já decidiu que estado derivado não pode competir com sua fonte. A mesma regra precisa valer para a documentação do programa.

## Decisão

### Uma fonte para cada tipo de conhecimento

- `architecture.md` possui boundaries e princípios;
- cada ADR possui sua própria decisão, título e status;
- cada `capabilities/*/capability.json` possui o estado observável de uma capability;
- `docs/program-status.json` possui somente progresso do programa: release, foco, fases, backlog, targets e jogos de prova;
- manifests em `reports/runs/` possuem evidência de execução;
- Git possui o histórico.

`ROADMAP.md`, `BACKLOG.md`, `DECISIONS.md` e `CAPABILITIES.json` são índices gerados. Editá-los manualmente é proibido.

### Relatórios de sessão não representam estado atual

`SESSION_REPORT.md` deixa de ser uma fonte viva. Evidência pertence a runs imutáveis e progresso pertence a `docs/program-status.json`. Um relatório histórico só pode existir com commit e `runId` explícitos e não pode ser apresentado como “último estado”.

### Validação obrigatória

O gerador de documentação:

1. valida `docs/program-status.json` por schema;
2. lê título e status diretamente dos ADRs;
3. exige numeração contínua dos ADRs;
4. valida referências de fase, tarefa, ADR e evidência;
5. rejeita fase concluída com pendência e fase planejada com entrega;
6. produz os três índices Markdown deterministicamente;
7. oferece `--check`, executado por `game validate` e pelos gates do repositório.

Uma alteração em fonte canônica que não regenere seus índices com `pnpm run docs` falha com `GENERATED_FILE_STALE`.

## Consequências

- os três índices públicos não podem divergir entre si;
- adicionar ou mudar um ADR atualiza `DECISIONS.md` por geração;
- progresso, backlog, targets e jogos de prova mudam no mesmo documento estruturado;
- relatórios antigos não continuam fazendo afirmações atuais;
- sincronização com o código ainda exige julgamento, mas toda entrega declarada aponta para evidência versionada e toda divergência mecânica falha automaticamente.

## Alternativas rejeitadas

- **Manter checklists pedindo atualização simultânea:** preserva múltiplas fontes e depende de memória.
- **Gerar estado a partir de mensagens de commit:** commits não expressam gates, limitações nem evidência suficiente.
- **Usar o roadmap Markdown como banco de dados:** parsing de prosa é frágil e permite afirmações duplicadas fora dos blocos conhecidos.
- **Criar um documento de status adicional:** aumentaria a quantidade de fontes em vez de reduzi-la.
