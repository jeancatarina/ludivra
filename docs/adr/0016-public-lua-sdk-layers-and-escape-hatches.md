# ADR 0016 — Camadas do SDK Lua público e escape hatches

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de abrir a camada 2 do SDK ou de promover qualquer símbolo a `stable`
- Complementa: [ADR 0004](0004-lua-sandbox.md) e [ADR 0011](0011-card-roguelite-content-and-authority.md)
- Depende de: [ADR 0017](0017-content-pack-compilation-and-migrations.md) para a tabela de símbolos e [ADR 0018](0018-numeric-determinism-and-rng-streams.md) para os streams de RNG da camada 1
- Fase: 4

## Contexto

A superfície Lua atual é deliberadamente mínima: `ctx.query.get_i64`, `ctx.commands.add_i64`, `play_audio`, `stop_audio`, `spawn_effect`, os campos de input `action_id` e `value_milli`, e o callback `on_input`. O sandbox do ADR 0004 remove `math.random`, `math.randomseed`, `load`, `dofile`, `loadfile` e `collectgarbage`, e aplica orçamento de 100.000 instruções por callback.

O roadmap descreve como pendência da Fase 4 um "SDK Lua público para entidades, componentes, tags, relações, recursos, timers, queries e comandos". Escrever essa API agora criaria abstração sem consumidor: nenhum jogo, capability ou cenário existente pede entidades, componentes ou relações. Os consumidores materiais dessas estruturas são o runtime espacial, que precisa de entidades por chunk, e o Mass Runtime, que precisa de armazenamento contíguo — ambos em fases posteriores, com requisitos de memória e determinismo que decidirão a forma correta.

Ao mesmo tempo, o gate da Fase 4 é real: uma sessão nova deve criar regra, conteúdo, tela, apresentação e cenário usando apenas APIs públicas. Hoje ela não consegue, porque o acesso ao estado é por chave inteira crua, não há tempo lógico utilizável por script, não há RNG lógico exposto e não existe declaração de qual símbolo é público, experimental ou removível.

## Decisão

### O SDK é um contrato versionado, não o que o kernel expõe

A superfície pública Lua passa a ser declarada como contrato versionado, com `sdkVersion` próprio, e verificada por teste de boundary. Um símbolo alcançável do script sem estar declarado é defeito, não recurso. Cada símbolo declara nome, camada, maturidade — `experimental`, `stable` ou `deprecated` — e o consumidor que o exige.

Símbolo sem consumidor atual é proibido. Depreciação exige condição objetiva de remoção e migração documentada.

### Camadas

**Camada 0 — existente.** Estado inteiro autoritativo, comandos, input, eventos de áudio e efeito. Permanece como é; este ADR apenas a declara e a documenta.

**Camada 1 — escopo da Fase 4.** Adiciona, com consumidor no starter e na fixture:

- acesso ao estado por símbolo semântico, resolvido uma única vez no carregamento pela tabela de símbolos do manifest, nunca por busca textual por tick;
- queries declarativas sobre o estado declarado, com custo inspecionável;
- timers em tempo lógico, com cancelamento e causa observáveis;
- streams de RNG lógico, cujo algoritmo é decidido pelo ADR de determinismo numérico e não por este;
- acesso somente leitura ao conteúdo compilado por ID;
- diagnósticos estruturados a partir de erro de script, com código estável, nunca falha silenciosa.

Símbolo desconhecido falha no carregamento com `SDK_SYMBOL_UNKNOWN`; resolução tardia por string é proibida.

**Camada 2 — entidades, componentes, tags, relações e recursos.** Fica explicitamente fora da Fase 4. Sua API será decidida pelo ADR da fase cujo consumidor a exige — runtime espacial ou Mass Runtime — porque são esses requisitos que determinam identidade, armazenamento, iteração e persistência. Até lá, um jogo que precise de estruturas semelhantes as mantém no próprio jogo, conforme a regra de extração após segundo uso.

Esta é uma correção de escopo do roadmap: a Fase 4 fecha seu gate com as camadas 0 e 1 mais a escada de escape hatches, e a camada 2 passa a pertencer à fase do seu consumidor.

### Escada de escape hatches

```text
JSONC validado
      ↓ insuficiente
capability existente
      ↓ insuficiente
Lua ou projector do jogo
      ↓ insuficiente
TypeScript de apresentação
      ↓ insuficiente
extensão nativa aprovada por ADR
```

Cada degrau exige registro do motivo pelo qual o anterior é insuficiente. Pular degraus é proibido. O último degrau exige ADR próprio, benchmark quando aplicável e justificativa além de um jogo, conforme o ADR 0012.

### Restrições que não mudam

Lua não acessa renderer, DOM, host, filesystem, rede, relógio civil, SDK de plataforma nem RNG externo. Projectors continuam read-only, rodam depois do commit do tick, não consomem RNG e não emitem comandos. O orçamento de instruções do ADR 0004 continua valendo e sua extrapolação é diagnóstico, não corte silencioso.

Códigos: `SDK_SYMBOL_UNKNOWN`, `SDK_SYMBOL_NOT_DECLARED`, `SDK_LAYER_NOT_AVAILABLE`, `SDK_QUERY_TOO_BROAD`, `SDK_TIMER_LOGICAL_TIME_REQUIRED`, `SDK_ESCAPE_HATCH_SKIPPED`.

## Consequências

- a superfície Lua deixa de ser "o que o sandbox permite" e passa a ser lista declarada e testada no boundary;
- a Fase 4 ganha um gate alcançável, sem inventar um modelo de entidades sem consumidor;
- o roadmap da Fase 4 precisa registrar que entidades, componentes, tags, relações e recursos pertencem à camada 2;
- o acesso por símbolo exige que a tabela de símbolos do conteúdo compilado exista, o que amarra este ADR ao de content pack;
- streams de RNG só podem ser expostos depois da decisão de determinismo numérico;
- maturidade por símbolo permite promover partes do SDK sem congelar o resto;
- jogos continuam podendo manter estruturas próprias até haver segundo uso real.

## Alternativas rejeitadas

- **Publicar agora entidades, componentes, tags e relações:** abstração sem consumidor, decidida antes dos requisitos de chunk, memória contígua e persistência que definiriam sua forma.
- **Manter o acesso ao estado por chave inteira crua como API pública:** obriga o jogo a repetir números que o manifest já possui e reintroduz a autoridade dupla que o ADR 0011 eliminou.
- **Resolver símbolos por string a cada tick:** custo por tick e falha tardia onde o carregamento poderia falhar cedo.
- **Deixar a superfície implícita no que o sandbox expõe:** impede depreciação, promoção e teste de boundary, e transforma qualquer detalhe interno em contrato de fato.
- **Expor RNG antes da decisão de determinismo:** fixaria por acidente o algoritmo que precisa de golden vectors e prova cross-platform.
- **Permitir extensão nativa sem ADR:** contorna a regra de responsabilidade nativa do ADR 0012.
