# ADR 0022 — Mass Runtime: armazenamento, níveis de simulação e budgets

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de declarar suporte a horda em qualquer target
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md), [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md) e [ADR 0020](0020-presentation-buffers-and-wasm-memory.md)
- Fase: 6

## Contexto

O Mass Runtime precisa simular populações grandes dentro de budget, e o ADR 0008 o tornou obrigatório no programa. A meta declarada no roadmap é gameplay completo onde importa e percepção de horda massiva, não um milhão de agentes completos.

Duas armadilhas conhecidas precisam ser fechadas por decisão. A primeira é o callback por agente por frame em Lua: com dez mil agentes e sessenta ticks, são seiscentas mil chamadas por segundo atravessando o sandbox, e o orçamento de instruções do ADR 0004 torna isso impossível antes de ser lento. A segunda é confundir simulação com projeção: um agente agregado que ainda gera um objeto de renderer por frame anula o ganho do nível de detalhe.

## Decisão

### Armazenamento contíguo

Dados massivos vivem em arrays paralelos por campo, contíguos e de tamanho de registro declarado. Objeto por agente com ponteiro é proibido nesse caminho. A ordem de iteração é determinística e independente de alocação.

Extrações aleatórias usam streams do domínio declarado pelo ADR 0018; um agente novo não desloca a sequência de nenhum outro.

### Níveis de simulação

Cinco níveis, com promoção e rebaixamento observáveis:

| Nível | Simulação | Persistência |
|---|---|---|
| entidade completa | individual | salva individualmente |
| agente simplificado | em lote | salvo como arrays |
| grupo agregado | por regra agregada | salvo como resumo |
| instância visual | nenhuma | não salva, regenerada |
| densidade ou partícula | nenhuma | não salva, regenerada |

Instância visual e partícula não são estado autoritativo e não entram no hash. Os três primeiros níveis entram, e sua contribuição para o hash é declarada por nível — individual, por array ordenado e por resumo.

A persistência dos três primeiros níveis usa o region storage do [ADR 0023](0023-world-persistence-and-region-storage.md), porque o archive lógico guarda pares de chave e inteiro e não arrays. Um jogo que declare Mass Runtime sem persistência mundial não persiste população: ela é regenerada a partir das regras de spawn, e isso é limitação declarada, não perda silenciosa.

Promoção e rebaixamento acontecem dentro de budget declarado. Pico de promoção acima do budget é `MASS_PROMOTION_SPIKE`, com causa e contagem.

### Fronteira com Lua

Lua configura comportamento, parâmetros e regras, e recebe **eventos agregados**. Callback por agente por frame é proibido e detectado como `MASS_LUA_PER_ENTITY_CALLBACK`.

Queries espaciais são limitadas por raio e por contagem máxima declarados. Query sem limite é `MASS_SPATIAL_QUERY_TOO_BROAD`, não uma varredura silenciosa.

### Operações em lote

Movimento, steering, separação, dano em área e despawn operam em lote sobre os arrays. Damage fields são declarativos, com forma, intervalo e efeito, e sua aplicação é ordenada deterministicamente por chave, nunca por ordem de descoberta espacial.

### Budget e apresentação

Cada target declara budget de agentes por nível, memória e tempo por tick. Exceder é diagnóstico com contagem — `MASS_ENTITY_BUDGET_EXCEEDED` — seguido de rebaixamento declarado de nível, nunca de descarte silencioso de agentes autoritativos.

A projeção usa os buffers do ADR 0020. Um agente em nível agregado não pode produzir registro individual de apresentação.

## Consequências

- o custo de uma horda passa a ser medido por nível, e não por contagem total de agentes;
- persistência de população deixa de exigir salvar cada partícula;
- Lua permanece utilizável em jogos massivos sem virar gargalo;
- a fronteira entre simulação e projeção fica verificável por budget e por buffer;
- promoção e rebaixamento tornam-se eventos observáveis, não efeito colateral;
- o hash passa a ter contribuição declarada por nível, o que exige fixture por nível;
- benchmark de horda torna-se pré-requisito para alegar suporte, conforme a target matrix.

## Alternativas rejeitadas

- **Objeto por agente com ponteiro:** perde localidade, inviabiliza lote e torna a ordem de iteração dependente de alocação.
- **Callback Lua por agente por frame:** estoura o orçamento de instruções do ADR 0004 antes de ser apenas lento.
- **ECS genérico para resolver o caso massivo:** abstração sem consumidor e com requisitos opostos ao de entidades completas.
- **Salvar partículas e instâncias visuais:** infla o save com dado regenerável e sem autoridade.
- **Query espacial sem limite:** transforma uma regra local em varredura global, com custo invisível no script.
- **Descartar agentes ao exceder budget:** apaga estado autoritativo para caber em um número, o que é falsificação de simulação.
- **Um único nível de simulação com LOD apenas visual:** mantém custo de CPU proporcional à população inteira.
