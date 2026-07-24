# ADR 0029 — Registry de benchmarks, performance profiles e baselines

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de alegar qualquer budget de performance na target matrix
- Complementa: [ADR 0009](0009-canonical-state-and-run-evidence.md) e [ADR 0028](0028-diagnose-repair-verify-and-repair-classes.md)
- Fase: 11

## Contexto

O gate da Fase 11 exige que a sessão não relate apenas "FPS baixo": ela deve nomear o sistema, archetype, chunk, batch, asset, construção, transporte ou efeito responsável. E a target matrix exige execução real antes de alegar suporte.

Há um obstáculo prático que precisa entrar na decisão em vez de ser descoberto depois. Runner de CI compartilhado tem variância alta e vizinho ruidoso. Medir tempo absoluto nele e comparar com budget produziria falha aleatória, e o resultado previsível é alguém aumentar o budget até parar de falhar — o pior desfecho possível para um gate de performance.

Os ADRs de escala já definiram budgets por nível, por buffer e por região. Falta o mecanismo que os mede e os compara.

## Decisão

### Registry de métricas

Cada métrica é registrada com id, proprietário, unidade, o que ela isola e o budget por target e perfil. Métrica sem proprietário ou sem unidade declarada não existe.

Métrica agregada de fachada — "FPS", "tempo de frame total" — não pode ser a única fonte de um gate. Todo gate aponta para a métrica que isola o subsistema, o que é o que torna o diagnóstico acionável.

### Performance profile

Um resultado só é válido acompanhado do seu profile: hardware, sistema, target, backend, resolução, viewport, warm-up, número de amostras, P50, P95, P99, variância e budget aplicado.

Resultado sem profile é `BENCHMARK_PROFILE_UNDECLARED`. Comparação entre profiles diferentes é recusada, seguindo a regra de evidência comparável do ADR 0028.

### Inconclusivo é resultado de primeira classe

Quando a variância das amostras excede o limite declarado, o resultado é **inconclusivo** — `BENCHMARK_VARIANCE_ABOVE_LIMIT` — e não passa nem falha. Ele não bloqueia o change set e também não pode ser reportado como aprovado.

Consequência direta: em runner compartilhado, o CI compara apenas **regressão relativa** entre revisões na mesma classe de runner. Alegação de budget absoluto exige máquina de referência declarada, e sem ela o item da target matrix é `NOT_AVAILABLE`, nunca `PASS`.

### Baselines

Baseline aprovada é dado versionado, atualizada somente por diff intencional que registre motivo, revisão e profile. Atualizar baseline para acomodar regressão sem motivo declarado é falsificação de evidência.

Baseline ausente é `BENCHMARK_BASELINE_MISSING`, classificado como `NOT_AVAILABLE`. Budget excedido com variância dentro do limite é `BENCHMARK_BUDGET_EXCEEDED` e falha.

Baselines de imagem seguem o ADR 0015; este ADR trata de baselines numéricas. Os dois compartilham a mesma regra de aprovação intencional.

Códigos: `BENCHMARK_PROFILE_UNDECLARED`, `BENCHMARK_BASELINE_MISSING`, `BENCHMARK_VARIANCE_ABOVE_LIMIT`, `BENCHMARK_BUDGET_EXCEEDED`, `BENCHMARK_METRIC_UNREGISTERED`, `BENCHMARK_RESULT_INCONCLUSIVE`.

## Consequências

- gates de performance passam a apontar subsistema, não sensação;
- variância deixa de virar pressão para inflar budget;
- CI compartilhado ganha um papel honesto: detectar regressão relativa;
- alegação absoluta de target exige máquina de referência declarada;
- baselines numéricas e visuais passam a compartilhar o regime de aprovação;
- cada budget declarado nos ADRs de escala precisa de métrica registrada correspondente;
- resultados inconclusivos passam a aparecer na evidência em vez de desaparecer.

## Alternativas rejeitadas

- **Medir tempo absoluto em runner compartilhado e comparar com budget:** falha aleatória cuja correção natural é afrouxar o budget.
- **Tratar inconclusivo como aprovado:** cria verde sem medição e destrói o valor do gate.
- **Tratar inconclusivo como falha:** bloqueia change sets por ruído de infraestrutura.
- **Gate apenas por FPS ou tempo total de frame:** não localiza o responsável e não atende ao gate da Fase 11.
- **Atualizar baseline automaticamente ao detectar regressão:** apaga exatamente o sinal que o mecanismo existe para preservar.
- **Média em vez de percentis:** esconde travada, que é o que o jogador percebe.
- **Métrica sem proprietário:** ninguém corrige, e o gate vira ruído tolerado.
