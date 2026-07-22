# ADR 0008 — Capacidades obrigatórias de escala e criação procedural

- Status: aceito
- Data: 2026-07-21
- Revisão: após os cinco jogos de prova ou antes de estabilizar a API 1.0
- Sequenciamento: complementado pelo [ADR 0012](0012-feature-first-roadmap-and-proof-games.md)

## Contexto

A arquitetura original definia como prova mínima de reutilização dois jogos diferentes e deixava mundos procedurais, multidões, física avançada, multiplayer player-hosted, construção procedural e ferramentas de geração dependentes de demanda futura. O roadmap 1.0 preservou essas áreas apenas como trilhas condicionais.

A visão de produto exige que essas áreas façam parte da premissa completa da Ludivra. Mantê-las opcionais no programa permitiria declarar a visão concluída sem comprovar os tipos de jogo e a escala que a engine deve entregar.

Ao mesmo tempo, torná-las obrigatórias em todo jogo ou antecipá-las no kernel violaria isolamento de capacidades, budgets proporcionais e a regra de extração após usos reais.

## Decisão

O programa completo da Ludivra deverá entregar e comprovar:

1. runtime espacial, chunks, streaming e mundo procedural virtualmente extensível dentro de budgets declarados;
2. motion, integração de física 2D/3D por adapters e Mass Runtime;
3. multiplayer player-hosted e host-authoritative para co-op e partidas casuais;
4. Construction Graph, geometria incremental e autoria procedural em runtime;
5. Visual, World, Construction, Physics e Audio Forges em authoring/build time.

Essas capacidades são obrigatórias no roadmap, mas permanecem modulares e opt-in por projeto. Um jogo que não as declara não deve carregar sua dependência, complexidade operacional ou custo relevante de runtime.

Cinco jogos serão provas obrigatórias: card roguelite, survivor-like, physics party brawler, procedural indie sandbox e procedural diorama builder. Conforme o ADR 0012, fundações de infraestrutura podem nascer de contratos, fixtures técnicas, cenários e benchmarks antes dos jogos completos. Abstrações de domínio continuam no primeiro jogo até existir um segundo uso diferente. Nenhuma capability é promovida a estável sem as provas integradas, os gates de observabilidade, portabilidade e performance aplicáveis.

Solvers físicos, transportes de rede e geradores externos continuam detalhes de adapters ou toolchain. Esta decisão não autoriza uma engine física própria, dependência específica, serviço comercial, publicação autônoma nem abstração genérica prematura.

## Consequências

- dois jogos continuam sendo o gate intermediário de reutilização, mas não concluem a visão completa;
- o roadmap só termina depois dos cinco jogos, das cinco famílias de Forge e das sessões frias correspondentes;
- as capacidades avançadas deixam de poder ser removidas apenas por falta de prioridade local;
- ordem, backend e representação interna continuam sujeitos a protótipos, ADRs e benchmarks;
- jogos pequenos permanecem finite-friendly e pagam apenas pelas capabilities declaradas;
- consoles, multiplayer competitivo, MMO, produção AAA e engine física própria continuam fora do compromisso.

## Alternativas rejeitadas

- manter as capacidades como trilhas condicionais: não representa a visão de produto decidida;
- colocar todas as capacidades no kernel desde a fundação: cria acoplamento e abstração sem evidência;
- exigir todas as capacidades de todo jogo: impõe custo incompatível com card games e projetos pequenos;
- declarar suporte sem os cinco jogos: substitui prova executável por intenção documental.
