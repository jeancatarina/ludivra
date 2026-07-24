# ADR 0026 — Construction Graph como fonte de verdade e compilação incremental

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de habilitar autoria de construção em runtime em qualquer jogo de prova
- Depende de: [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md) e [ADR 0020](0020-presentation-buffers-and-wasm-memory.md)
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md) e [ADR 0023](0023-world-persistence-and-region-storage.md)
- Fase: 9

## Contexto

A Fase 9 exige construção procedural interativa cuja fonte de verdade seja um grafo semântico, nunca a mesh derivada. Nada disso existe.

A decisão precisa vir antes da implementação por um motivo específico: se a mesh puder ser editada diretamente, mesmo em um único caminho, o grafo deixa de reconstruir o resultado e a construção se torna irreproduzível — undo, replay, persistência por deltas e diagnóstico causal caem todos juntos. Essa é uma propriedade que não se recupera depois.

O ADR 0023 já decidiu que Construction Graphs são salvos e que geometria derivada não é. Este ADR decide o que isso exige do runtime.

## Decisão

### O grafo é a única fonte editável

`Construction Graph` é versionado e contém volumes, footprints, paredes, pisos, telhados, aberturas, caminhos, cercas, escadas, fundações, decoração e constraints.

Mesh, collider, decoração instanciada e UV são **derivados**. Editar geometria derivada é proibido; não existe caminho de escape que grave direto na mesh. Alteração acontece por comando semântico sobre o grafo.

### Comandos, undo e replay

Toda edição é comando semântico com ID estável de nó, parâmetros declarados e efeito determinístico. A sequência de comandos reproduz o grafo idêntico a partir do estado inicial.

Undo e redo operam sobre comandos, não sobre snapshots de geometria. Replay de uma sessão de construção produz o mesmo grafo e, consequentemente, a mesma geometria — verificado por hash do grafo, não por comparação de mesh.

### Compilação incremental

O Geometry Compiler é incremental por região e por dependência. Mover uma parede recompila a região afetada e as dependências declaradas dessa região, nunca a construção inteira.

O cache de compilação é indexado por hash de subgrafo. Recompilação acima do budget declarado é diagnóstico com a causa — qual nó, qual regra, qual dependência expandiu o escopo.

Booleanas são controladas e declaradas; falha de booleana é diagnóstico com o par de operandos, nunca geometria silenciosamente inválida.

### Solver de constraints

O solver é especializado em espaçamento, alinhamento, continuidade, suporte, interseção e prioridade. Ele é determinístico e sua ordem de resolução é declarada, não emergente da ordem de inserção.

Conflito insolúvel é reportado com o conjunto mínimo de constraints em conflito. Resolver conflito escolhendo arbitrariamente é proibido: o autor decide.

### Rastreabilidade

Toda mesh, collider e instância de decoração aponta para construção, nó, regra, asset, região e comando de origem. É isso que permite responder "por que esta parede tem um arco aqui" sem inspecionar geometria.

Decoração usa seeds locais derivadas pelo domínio declarado do ADR 0018, com máscaras, exclusões, budgets e LOD. Decoração não pode ser autoridade sobre colisão de gameplay salvo quando declarado explicitamente no grafo.

Códigos: `CONSTRUCTION_FOOTPRINT_INVALID`, `CONSTRUCTION_SELF_INTERSECTION`, `CONSTRUCTION_WALL_GAP`, `CONSTRUCTION_BOOLEAN_FAILED`, `CONSTRUCTION_ROOF_UNRESOLVED`, `CONSTRUCTION_CONSTRAINT_CONFLICT`, `CONSTRUCTION_REBUILD_BUDGET_EXCEEDED`, `CONSTRUCTION_MESH_EDIT_FORBIDDEN`, `CONSTRUCTION_FOUNDATION_UNSUPPORTED`, `CONSTRUCTION_DECORATION_FLOATING`.

## Consequências

- construção salva é pequena e regenerável, coerente com o ADR 0023;
- undo, redo e replay compartilham o mesmo mecanismo, em vez de três implementações;
- o custo de edição fica proporcional à região afetada e é medido;
- todo detalhe derivado tem origem rastreável até um comando;
- o solver precisa de ordem declarada, o que exige fixture de ordem e de conflito;
- nenhuma ferramenta pode oferecer edição direta de mesh, nem como recurso avançado;
- geometria inválida passa a ser diagnóstico, não artefato visual estranho.

## Alternativas rejeitadas

- **Mesh editável como fonte de verdade:** destrói undo, replay, persistência por deltas e rastreabilidade de uma só vez.
- **Undo por snapshot de geometria:** custo de memória proporcional à cena e divergente do replay por comandos.
- **Recompilar a construção inteira a cada edição:** inviabiliza autoria interativa em construções grandes.
- **Solver com ordem emergente da inserção:** torna o resultado dependente do histórico de edição e impossível de reproduzir.
- **Resolver conflito de constraints por heurística silenciosa:** o autor perde controle e o defeito aparece como geometria inexplicável.
- **Decoração com autoridade implícita sobre colisão:** cria regra de gameplay a partir de detalhe estético.
- **Permitir uma exceção de edição direta de mesh:** basta um caminho para que a propriedade deixe de valer em toda a Fase 9.
