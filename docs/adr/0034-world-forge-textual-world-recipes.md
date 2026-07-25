# ADR 0034 — World Forge: receitas textuais de terreno, bioma e distribuição

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de gerar o primeiro mundo consumido por um jogo de prova
- Especializa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md)
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md) e [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md)
- Fase: 10

## Contexto

O ADR 0019 decidiu que um chunk é função pura de dimensão, coordenada, `generatorId`, `generatorVersion` e seed derivada. O que ainda não existe é a autoria: quem descreve o mundo, em que formato, e como o resultado é auditado antes de um jogo depender dele.

Sem receita textual, o mundo vira código de gerador espalhado, com constantes mágicas que ninguém revisa por diff e que um agente não consegue ajustar sem ler implementação.

Há também uma distinção que precisa ficar registrada: o World Forge é **authoring**, e o runtime espacial é **execução**. Os dois compartilham o gerador, não o momento.

## Decisão

### A receita descreve o mundo, o runtime o materializa

`world/*.world.jsonc` declara dimensões, seed raiz, `generatorId`, `generatorVersion`, camadas de elevação, biomas com regras de transição, hidrografia, cavernas, vegetação, recursos, estruturas, clima e distribuições. Cada distribuição declara densidade, máscara, exclusão e budget.

A receita é a fonte de verdade do mundo. Ela não contém heightmap, mesh nem chunk: contém as regras que o gerador aplica. Isso é o que permite que um mundo virtualmente infinito seja descrito por um documento pequeno e revisável.

### Mesmo gerador em authoring e em runtime

O Forge não tem um gerador próprio: ele executa o gerador do runtime espacial em modo de authoring, com a mesma identidade de chunk e os mesmos streams de RNG. Um segundo gerador para preview seria uma segunda fonte de verdade e produziria preview que mente.

O Forge acrescenta o que só faz sentido em authoring: varredura de uma área declarada, agregação de métricas, geração de preview e relatório.

### Preview e validação por região amostrada

O Forge amostra regiões declaradas — não o mundo inteiro — e produz mapa de elevação, mapa de bioma, mapa de recursos, histogramas e um relatório.

Valida, no mínimo: seam entre chunks, continuidade de rio, estrutura flutuante, recurso inacessível, densidade fora da faixa, variedade insuficiente, budget de entidades por região e determinismo por permutação de ordem de geração.

Falha bloqueia a promoção da receita para uso por um jogo.

### Artefato: receita mais evidência, nunca terreno

O Forge **não** versiona terreno gerado. O artefato é a receita mais o relatório, o preview e os hashes de amostra. Terreno é regenerado pelo runtime a partir da identidade do chunk, exatamente como o ADR 0023 exige para não duplicar mundo no save.

```bash
game world render   --project <p> [--region <x,z>]
game world inspect  --project <p>
game world validate --project <p>
```

Códigos: `WORLD_RECIPE_INVALID`, `WORLD_RECIPE_NONDETERMINISTIC`, `WORLD_SEAM_DETECTED`, `WORLD_RIVER_DISCONTINUOUS`, `WORLD_STRUCTURE_FLOATING`, `WORLD_RESOURCE_UNREACHABLE`, `WORLD_DENSITY_OUT_OF_RANGE`, `WORLD_VARIETY_INSUFFICIENT`, `WORLD_REGION_BUDGET_EXCEEDED`.

## Consequências

- o mundo passa a ser autorável por texto e ajustável por parâmetro;
- preview e execução compartilham o gerador, então preview não mente;
- o repositório não recebe terreno gerado;
- `generatorVersion` na receita amarra migração de mundos salvos à decisão do ADR 0023;
- validação de seam e de acessibilidade entra antes do jogo, não depois do bug;
- amostragem por região mantém o custo do Forge proporcional ao que foi pedido.

## Alternativas rejeitadas

- **Gerador em código sem receita:** constantes não revisáveis e mundo não ajustável por agente.
- **Gerador separado para preview:** segunda fonte de verdade e preview que divergirá do jogo.
- **Versionar heightmap ou chunks:** infla o repositório com o que a seed já determina.
- **Validar o mundo inteiro:** custo ilimitado; amostragem declarada é verificável e suficiente.
- **Distribuição sem budget:** produz região que estoura memória só quando o jogador chega lá.
