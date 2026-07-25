# ADR 0039 — Camada 2 do SDK: entidades, componentes, tags, relações e recursos

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de expor a camada 2 como `stable`, ou se o Mass Runtime exigir layout diferente
- Fecha a pendência de: [ADR 0016](0016-public-lua-sdk-layers-and-escape-hatches.md)
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md), [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md) e [ADR 0022](0022-mass-runtime-storage-levels-and-budgets.md)
- Fases: 5 e 6

## Contexto

O ADR 0016 declarou três camadas do SDK Lua e deixou a camada 2 — entidades, componentes, tags, relações e recursos — para o ADR da fase do consumidor. Os consumidores agora existem em decisão: o runtime espacial precisa de entidades por chunk e o Mass Runtime precisa de armazenamento contíguo por nível de simulação.

Enquanto essa pendência existir, chunk e horda não têm onde guardar entidade, e o SDK não tem como expor o que os jogos vão pedir.

O requisito que decide a forma não é ergonomia de API: é que o estado seja determinístico, salvável, hasheável e iterável em lote.

## Decisão

### Handles geracionais, nunca ponteiros nem índices crus

Uma entidade é um handle de 64 bits com índice e geração. Destruir e recriar reusa o índice e incrementa a geração, então um handle antigo é detectado como inválido em vez de apontar para outra entidade. Ponteiro e índice cru são proibidos no boundary público.

### Armazenamento por archetype, em arrays paralelos

Componentes são declarados por schema com campos inteiros de escala declarada conforme o ADR 0018. Entidades com o mesmo conjunto de componentes vivem no mesmo archetype, em arrays paralelos por campo. Adicionar ou remover componente move a entidade de archetype, em boundary de commit.

Esse layout é o mesmo que o ADR 0022 exige para dados massivos: a camada 2 e o Mass Runtime compartilham armazenamento, com níveis de simulação diferentes, em vez de dois modelos concorrentes.

Ponto flutuante em componente autoritativo é proibido.

### Tags e relações

Tag é conjunto sem dado, representado por bitset por archetype. Relação é aresta tipada entre handles, com direção declarada e integridade garantida na destruição: destruir uma entidade remove suas arestas e reporta as que eram exigidas por outra ponta.

Recurso é estado singular nomeado, com o mesmo regime de componente. Ele não é uma entidade especial nem uma variável global.

### Queries declarativas com custo visível

Uma query declara componentes exigidos, componentes proibidos, tags e escopo espacial quando aplicável. Ela é resolvida em archetypes, não por varredura de entidades, e sua ordem de iteração é determinística: por archetype declarado e por índice crescente.

Query sem escopo em mundo espacial é `SDK_QUERY_TOO_BROAD`, como já previa o ADR 0016.

### Persistência e hash

A contribuição da camada 2 ao hash é declarada por archetype, sobre arrays ordenados. Persistência segue o ADR 0023: entidades persistentes e resumos regionais vivem no region storage; instância visual e partícula não são salvas.

Adicionar um componente novo a um jogo não pode alterar o hash das entidades que não o possuem — é essa propriedade que mantém replays antigos válidos, e ela decorre do archetype.

### Superfície Lua da camada 2

Criar e destruir entidade, adicionar e remover componente, ler e escrever campo por símbolo, marcar e consultar tag, criar e percorrer relação, executar query declarada e receber eventos agregados. Nenhuma API expõe archetype, índice, ponteiro ou layout — trocar o layout interno não pode quebrar jogo.

Códigos: `SDK_ENTITY_HANDLE_STALE`, `SDK_COMPONENT_UNDECLARED`, `SDK_COMPONENT_FLOAT_FORBIDDEN`, `SDK_RELATION_DANGLING`, `SDK_QUERY_TOO_BROAD`, `SDK_ARCHETYPE_MIGRATION_OUTSIDE_COMMIT`, `SDK_RESOURCE_UNDECLARED`.

## Consequências

- chunk e horda passam a ter um único modelo de estado, não dois;
- handle geracional elimina a classe de bug em que um id antigo lê outra entidade;
- ordem de iteração determinística mantém replay e comparação host/cliente válidos;
- adicionar componente a um jogo não invalida replays de entidades que não o usam;
- o layout interno permanece substituível porque não vaza para o SDK;
- migração de archetype no commit exige boundary explícito, alinhado ao ADR 0019;
- a camada 2 só é promovida a `stable` depois de dois consumidores reais, conforme o ADR 0012.

## Alternativas rejeitadas

- **Id inteiro simples sem geração:** reuso de id faz handle antigo apontar para entidade nova, com bug silencioso.
- **Objeto por entidade com ponteiro:** perde localidade, impede lote e torna a ordem dependente de alocação.
- **Array de structs:** paga leitura de campos não usados em toda iteração em lote.
- **Modelo separado para o Mass Runtime:** duas fontes de verdade para população, com promoção entre níveis impossível de manter.
- **Query por varredura de todas as entidades:** custo proporcional ao mundo para uma pergunta local.
- **Expor archetype ou índice no SDK:** congelaria o layout interno como contrato público.
- **Ponto flutuante em componente autoritativo:** contraria o ADR 0018 e quebra hash entre targets.
