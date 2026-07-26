# ADR 0054 — Regiões de navegação, pathfinding e avoidance

- Status: provisório
- Data: 2026-07-26
- Revisão: antes de adicionar o primeiro backend de navmesh ou liberar rebake em runtime
- Complementa: [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md), [ADR 0022](0022-mass-runtime-storage-levels-and-budgets.md) e [ADR 0048](0048-textual-scene-prefab-and-resource-graph.md)
- Fases: 5 e 6

## Contexto

O runtime espacial cita jobs de pathfinding, mas não existe contrato para mapas, regiões, agentes, links, obstáculos ou baking. Física e visual não são navegação: collider descreve contato, mesh descreve imagem e nenhuma das duas define sozinha onde um agente pode caminhar.

Escolher uma biblioteca antes do primeiro mapa consumidor criaria dependência de runtime sem parâmetros de agente, chunk e atualização conhecidos.

## Decisão

### Contrato independente do backend

O contrato público cobre navigation map, region, polygon/navmesh asset, agent profile, layers, off-mesh link, dynamic obstacle, path query e avoidance request. Handles são opacos; gameplay não acessa estruturas da biblioteca.

Scene e World Forge fornecem source geometry e regiões por IDs semânticos. O cooker pode derivar navegação de colliders ou geometria simplificada, mas o resultado é asset próprio, versionado e inspecionável.

### Baking e chunks

Baking de produção ocorre em authoring/build time. Runtime rebake é capability opt-in, executada como job fora do commit e aplicada apenas em boundary determinístico. Mundos extensos usam regiões alinhadas a chunks com borda declarada; carregar ou descartar região não muda IDs vizinhos.

### Queries, movimento e authority

Path query recebe mapa, perfil, origem, destino, layers e limites. O resultado é uma sequência quantizada e metadados de regiões/links. Encontrar caminho não move corpo: motion e física continuam no ADR 0021.

Avoidance produz intenção de velocidade, não transform final. Para autoridade de gameplay, inputs e resultados quantizados entram no replay; para multidões agregadas, o Mass Runtime pode usar solução simplificada declarada.

### Backend permanece aberto com gate

A primeira dependência concreta exige benchmark com o mapa e os perfis do consumidor, licença compatível, CMake, native/WASM e inspeção de queries. Até essa revisão, fixtures usam um adapter de referência pequeno em mapas fechados; ele não autoriza alegar navmesh de produção.

Códigos: `NAVIGATION_MAP_UNAVAILABLE`, `NAVIGATION_REGION_INVALID`, `NAVIGATION_PROFILE_UNDECLARED`, `NAVIGATION_PATH_NOT_FOUND`, `NAVIGATION_QUERY_BUDGET_EXCEEDED`, `NAVIGATION_REGION_NOT_SYNCHRONIZED`, `NAVIGATION_BACKEND_NOT_AVAILABLE`.

## Consequências

- pathfinding não fica acoplado ao renderer nem ao solver físico;
- mundos procedurais podem carregar navegação por região;
- baking caro sai do frame e ganha artefato reproduzível;
- avoidance integra com motion sem escrever transform diretamente;
- a seleção de vendor será feita com consumidor e benchmark reais.

## Alternativas rejeitadas

- **Usar collider como navmesh implicitamente:** colisão não expressa área caminhável, custo ou links.
- **Consultar mesh visual em runtime:** força readback, aumenta custo e mistura apresentação com regra.
- **Escolher backend sem consumidor:** dependência e API guiadas por hipótese.
- **Rebake síncrono no tick:** cria travada e ordem dependente de duração.
- **Pathfinding mover entidade diretamente:** mistura planejamento com motion e física.
