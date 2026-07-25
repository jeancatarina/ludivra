# ADR 0035 — Construction Forge: gramáticas de estilo arquitetônico

- Status: provisório
- Data: 2026-07-24
- Revisão: antes do primeiro estilo consumido pelo diorama builder
- Especializa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md)
- Depende de: [ADR 0026](0026-construction-graph-as-source-of-truth.md)
- Fase: 10

## Contexto

O ADR 0026 decidiu que o `Construction Graph` é a fonte de verdade e que mesh, collider e decoração são derivados. O que falta é a autoria do **estilo**: quais paredes, telhados, aberturas, escadas, arcos e fundações existem, como se encontram, e que regras de decoração se aplicam.

Sem isso, cada construção repetiria decisões estéticas dentro do grafo, e um agente não teria como pedir "vila élfica de madeira" sem descrever cada peça.

## Decisão

### O estilo é uma gramática textual

`construction/*.style.jsonc` declara um estilo com peças, regras de encontro — a Building Chemistry —, constraints padrão, presets de ferramenta e regras de decoração contextual. Cada peça é paramétrica, com faixas declaradas e seed própria.

O estilo é reutilizável entre construções: ele descreve vocabulário, não um edifício. Um edifício continua sendo um `Construction Graph`.

### O Forge compila estilo, não geometria final

A saída do Forge é o estilo compilado, validado e indexado, mais previews de peça e de combinação. Geometria de um edifício continua vindo do Geometry Compiler incremental do ADR 0026 em runtime ou build, a partir do grafo.

Isso preserva a propriedade central do ADR 0026: mover uma parede reconstrói apenas a região afetada. Um Forge que emitisse geometria final quebraria essa propriedade.

### Validação de gramática

Valida, no mínimo: fechamento de parede em cada encontro declarado, telhado resolvido em todas as inclinações permitidas, escada praticável dentro da faixa de passo e espelho, arco e quina sem self-intersection, fundação com suporte, união entre estilos vizinhos e budget de peças por metro.

Cada combinação de encontro não resolvida é falha nomeada, com as duas peças e a regra ausente. Uma gramática incompleta que só falha quando o jogador constrói é o defeito que este Forge existe para impedir.

### Previews como matriz de combinação

O preview não é uma casa bonita: é a **matriz** de encontros — parede com parede, parede com telhado, telhado com telhado, abertura em cada parede, escada em cada piso — renderizada e inspecionável. É isso que um agente consegue ler para saber se a gramática está completa.

```bash
game construction render   --project <p> [--style <id>]
game construction validate --project <p> --style <id>
game construction inspect  --project <p>
```

Códigos: `CONSTRUCTION_STYLE_INVALID`, `CONSTRUCTION_PIECE_UNKNOWN`, `CONSTRUCTION_JOIN_UNRESOLVED`, `CONSTRUCTION_ROOF_RULE_MISSING`, `CONSTRUCTION_STAIR_UNWALKABLE`, `CONSTRUCTION_STYLE_MIX_UNDECLARED`, `CONSTRUCTION_PIECE_BUDGET_EXCEEDED`.

## Consequências

- um agente pede um estilo e recebe vocabulário verificado, não um edifício isolado;
- a matriz de encontros transforma gramática incompleta em falha de authoring;
- o Geometry Compiler permanece o único produtor de geometria, preservando o rebuild incremental;
- estilos são reutilizáveis entre jogos sem carregar construções específicas;
- misturar estilos passa a exigir declaração explícita.

## Alternativas rejeitadas

- **Forge que emite geometria final:** quebraria o grafo como fonte de verdade e o rebuild por região do ADR 0026.
- **Estilo embutido no grafo de cada construção:** repetiria decisões estéticas e impediria reuso.
- **Preview por cena de exemplo:** esconde exatamente os encontros que faltam.
- **Resolver encontro ausente por heurística em runtime:** produz geometria inexplicável durante o jogo, contra o ADR 0026.
