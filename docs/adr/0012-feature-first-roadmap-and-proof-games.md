# ADR 0012 — Roadmap feature-first e jogos como provas finais

- Status: aceito
- Data: 2026-07-22
- Revisão: antes de promover a primeira capability avançada a estável ou ao concluir a Fase 12
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md)

## Contexto

O roadmap 2.0 nomeou fases avançadas pelos jogos que deveriam comprová-las: survivor-like, sandbox, party brawler e diorama builder. Essa organização tornou o consumidor mais visível que a fundação técnica e sugeriu que a equipe deveria produzir outro jogo antes de construir Mass Runtime, runtime espacial, física, multiplayer ou construção procedural.

O ADR 0008 tornou essas capacidades e os cinco jogos obrigatórios, mas também afirmou que cada capacidade nasceria no jogo que a exige. Aplicada literalmente à sequência do programa, essa regra mistura três coisas diferentes:

1. fundação de infraestrutura da engine;
2. abstração de domínio reutilizável entre jogos;
3. integração final em um jogo completo.

Runtime de chunks, buffers de projeção, control protocol e adapters físicos são fundações de infraestrutura. Eles podem ser especificados e comprovados por contratos, fixtures técnicas, cenários e benchmarks antes de um jogo completo. Já conceitos como deck, combate por turnos ou inventário genérico continuam sem justificativa antes de usos diferentes.

O card roguelite implementado em `examples/card-roguelite` demonstrou a consequência prática da ordem anterior: existe um loop lógico de jogo antes de a UI real do BrowserHost e a captura raster estarem completas. O exemplo é útil como fixture de integração, mas não deve redefinir a ordem das fundações restantes.

## Decisão

O roadmap será organizado por **fases de capacidades técnicas**, não por jogos.

Cada fase técnica deverá declarar:

- objetivo e fronteira proprietária;
- entregas técnicas concretas;
- estado atual: entregue, parcial, planejado ou indisponível;
- contratos, comandos e dados autoráveis;
- observabilidade, diagnósticos e cenários exigidos;
- performance gate quando aplicável;
- dependências e critério de saída.

Os cinco jogos permanecem obrigatórios, mas serão tratados como **provas integradas da Fase 12**. Protótipos e exemplos podem existir antes dessa fase como fixtures de regressão e integração. Eles não promovem a fase final nem substituem a fundação técnica ainda ausente.

### Escada de comprovação

Uma capability de infraestrutura avança nesta ordem:

```text
contrato e owner
        ↓
fixture técnica mínima
        ↓
cenário funcional e diagnóstico
        ↓
benchmark ou gate de target aplicável
        ↓
integração em um ou mais jogos de prova
        ↓
promoção de maturidade
```

Fixture técnica não é alegação de suporte a um gênero. O jogo completo continua sendo necessário para comprovar integração, autoria, ergonomia e valor real.

### Regra contra abstração prematura

Capacidades de infraestrutura exigidas pela arquitetura podem começar experimentais com um produtor, um consumidor técnico e um cenário fechado. Isso não autoriza APIs genéricas de gênero.

Abstrações de domínio compartilhadas seguem a regra existente:

```text
primeiro uso permanece no jogo
segundo uso revela a API mínima comum
terceiro uso estabiliza ou revisa a API
```

Uma fundação técnica também não entra no kernel apenas por estar no roadmap. Responsabilidade nativa continua exigindo determinismo, portabilidade, benchmark quando aplicável e justificativa além de um jogo.

### Reclassificação do card roguelite

`examples/card-roguelite` e o `ENG-016` permanecem válidos como fixture de integração antecipada para gameplay, conteúdo, save e replay. Eles não contam como conclusão do jogo de prova final enquanto UI real, captura raster, target aplicável e sessão fria do gate final não passarem.

`ENG-017` e `ENG-018` passam a pertencer à fase de Control Plane e observabilidade do BrowserHost, ainda que usem o card roguelite como fixture.

## Consequências

- o roadmap volta a mostrar explicitamente o que será construído na engine antes dos jogos finais;
- Mass Runtime, mundo procedural, física, multiplayer, construção e Forges deixam de aparecer como efeitos colaterais de criar jogos;
- cenários e benchmarks técnicos podem comprovar fundações sem inflar um protótipo em produto;
- os cinco jogos continuam obrigatórios e ganham um gate final mais forte;
- o card roguelite existente não é descartado nem tratado como jogo concluído;
- capacidades continuam modulares e opt-in por projeto;
- o backlog será detalhado fase técnica por fase técnica;
- a arquitetura precisa distinguir capability de infraestrutura de abstração de domínio.

## Alternativas rejeitadas

- **Manter fases nomeadas por jogos:** oculta o trabalho de engine e induz implementação de conteúdo antes das fundações.
- **Remover os jogos de prova:** permitiria declarar suporte com fixtures artificiais e sem integração real.
- **Construir todas as APIs antes de qualquer consumidor:** criaria abstrações especulativas e violaria os guardrails.
- **Apagar o card roguelite antecipado:** perderia uma fixture útil de determinismo, conteúdo e regressão.
- **Tratar o anexo consolidado como especificação executável literal:** ele contém direção correta, mas também exemplos conceituais, comandos futuros e estruturas que precisam ser reconciliados com contratos já implementados.
