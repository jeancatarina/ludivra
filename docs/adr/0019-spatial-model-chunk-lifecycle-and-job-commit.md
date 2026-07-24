# ADR 0019 — Modelo espacial, lifecycle de chunk e commit de jobs

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de habilitar a capability espacial em qualquer jogo de prova
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md)
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md)
- Fase: 5

## Contexto

A Fase 5 exige uma fundação opt-in comum a mapas pequenos, mundos extensos e sandboxes virtualmente infinitos. Nada disso existe: não há modelo espacial, chunk, job nem streaming, e o kernel hoje conhece apenas estado inteiro por chave.

Três riscos precisam ser decididos antes da implementação, porque nenhum deles é reversível depois que mundos gerados existirem. A representação de posição entra em save, replay e rede. A ordem de aplicação de resultados assíncronos determina se o mundo é reproduzível. E a identidade do chunk determina se um mundo pode ser regenerado em vez de duplicado no save.

O ADR 0018 é pré-requisito: sem escala declarada e sem streams com separação de domínio, geração procedural não é reproduzível e chunks vizinhos não podem ser gerados em qualquer ordem com o mesmo resultado.

## Decisão

### Posição

Posição autoritativa é composta por dimensão, região, coordenada de chunk e posição local, toda em inteiros com escala declarada conforme o ADR 0018.

A composição é detalhe interno substituível: conversões, empacotamento e largura de campo não são API pública permanente. O que é público é a operação semântica — mover, consultar vizinhança, converter para coordenada de chunk — nunca o layout de bits.

### Identidade e geração de chunk

Um chunk é identificado por dimensão, coordenada, `generatorId`, `generatorVersion` e a seed derivada pelo domínio de geração do ADR 0018. Seu `contentHash` cobre base gerada e deltas aplicados.

Geração é função pura de identidade: mesma identidade produz o mesmo chunk, em qualquer ordem, em qualquer target suportado, em qualquer número de threads. O gerador não lê relógio, não consome stream fora do seu domínio, não observa chunks vizinhos já residentes e não depende de ordem de carregamento. Violação é `WORLD_GENERATOR_NON_DETERMINISTIC`.

`generatorVersion` é obrigatório em toda persistência: mundo gerado por versão anterior é migrado ou regenerado explicitamente, nunca reinterpretado.

### Lifecycle

Os estados são `UNLOADED`, `REQUESTED`, `GENERATING`, `READY_FOR_MESH`, `MESHING`, `RESIDENT`, `DIRTY`, `SAVING` e `EVICTABLE`. As transições legais são declaradas; transição ilegal é diagnóstico, não recuperação silenciosa.

Chunk descartado libera entidades, colliders, mesh e caches associados. Recurso residente após descarte é `WORLD_CHUNK_LEAK`.

### Commit de jobs

Jobs de geração, meshing, pathfinding, compressão e I/O são assíncronos e **não mutam estado autoritativo**. Cada job produz um resultado que é aplicado em um boundary de commit declarado, ordenado por chave determinística — tipo de job, dimensão, coordenada e sequência — nunca por ordem de conclusão.

Um job que não conclui dentro do seu boundary não bloqueia o tick: ele permanece pendente e o estado do chunk reflete isso. Job que bloqueia o tick é `WORLD_JOB_BLOCKED_TICK`.

Essa é a propriedade que o cenário de ordem permutada verifica: com as mesmas entradas e conclusões em ordens diferentes, o hash lógico do mundo é idêntico.

### Partitioning e LOD

A estrutura de particionamento — grid, sparse grid, quadtree, octree, BVH ou region index — é interna, substituível e escolhida por benchmark por capability. Ela não vaza para o contrato público.

O LOD de simulação tem níveis ativo, simplificado, agregado e não carregado. Catch-up usa tempo lógico e regras agregadas, e o resultado do catch-up é reproduzível a partir do tempo decorrido, não do tempo de parede.

### Floating origin

Não entra por antecipação. Entra quando um teste de precisão demonstrar que a coordenada máxima declarada excede o orçamento de erro do fixed-point escolhido. O teste é o gate; a ausência dele mantém o recurso fora.

### Fora do escopo

Formato de armazenamento de região e sincronização por rede pertencem aos ADRs de persistência e multiplayer. Algoritmo de meshing e compilação de geometria pertencem às fases de apresentação e construção. Este ADR decide modelo, identidade, lifecycle e commit.

Códigos: `WORLD_GENERATOR_NON_DETERMINISTIC`, `WORLD_CHUNK_HASH_MISMATCH`, `WORLD_CHUNK_LEAK`, `WORLD_SEAM_DETECTED`, `WORLD_JOB_BLOCKED_TICK`, `WORLD_CHUNK_TRANSITION_INVALID`, `WORLD_GENERATOR_VERSION_UNSUPPORTED`.

## Consequências

- mundo gerado passa a ser regenerável, o que permite salvar deltas em vez de terreno inteiro;
- a ordem de conclusão de jobs deixa de influenciar o resultado, e a paralelização deixa de ser risco de divergência;
- o layout de coordenada permanece substituível sem quebrar jogos;
- `generatorVersion` entra em toda persistência e obriga decisão explícita de migração;
- a capability continua opt-in: um jogo que não a declara não paga chunk, job nem streaming;
- floating origin fica condicionado a um teste, não a preferência;
- estruturas de particionamento podem ser trocadas por benchmark sem ADR novo, desde que permaneçam internas.

## Alternativas rejeitadas

- **Posição em ponto flutuante global:** perde precisão longe da origem exatamente onde sandboxes extensos operam, e conflita com o ADR 0018.
- **Expor o layout de coordenada como API pública:** congelaria empacotamento de bits e impediria trocar região, dimensão ou largura sem quebrar jogos.
- **Aplicar resultado de job na ordem de conclusão:** torna o mundo dependente de escalonamento de thread e destrói replay.
- **Permitir que o gerador observe vizinhos residentes:** cria dependência de ordem de carregamento e produz seam que só aparece em uma das direções de viagem.
- **Chunk sem `generatorVersion`:** transformaria melhoria de gerador em corrupção silenciosa de mundos salvos.
- **Escolher agora a estrutura de particionamento definitiva:** decisão de desempenho sem benchmark e sem consumidor.
- **Floating origin desde o início:** complexidade em toda conversão de coordenada antes de existir prova de que a precisão falha.
