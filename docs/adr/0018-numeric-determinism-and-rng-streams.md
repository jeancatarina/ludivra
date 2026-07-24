# ADR 0018 — Determinismo numérico: fixed-point e streams de PRNG

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de expor RNG no SDK público ou de gerar o primeiro chunk procedural
- Complementa: [ADR 0004](0004-lua-sandbox.md) e [ADR 0009](0009-canonical-state-and-run-evidence.md)
- Fecha: itens "algoritmo e representação de fixed-point" e "PRNG e estratégia de streams" da seção 36 de [architecture.md](../../architecture.md)
- Fase: pré-requisito da camada 1 do SDK na Fase 4 e das Fases 5 a 7

## Contexto

O estado autoritativo já é inteiro: `integer_state` guarda `int64_t` por chave `uint32_t`, o hash mistura bytes por FNV e o commit recusa overflow em vez de saturar. A escala, porém, é convenção implícita espalhada em nomes: `value_milli`, `x_milli`, `y_milli`, `z_milli`. Nenhum contrato declara escala, arredondamento ou faixa, e nada impede que uma quantidade nova adote outra escala silenciosamente.

RNG não existe no caminho autoritativo. O sandbox do ADR 0004 removeu `math.random` e `math.randomseed` justamente para não deixar entrar uma sequência dependente de plataforma. Isso resolveu o risco imediato e deixou uma lacuna: chunk com seed derivada, geração procedural, distribuição de recursos, hordas e sincronização por seed são exigências das fases seguintes, e nenhuma delas pode ser implementada sem estratégia de streams decidida.

Decidir isso depois seria caro. Escala e PRNG entram em save, replay, hash e comparação entre host e cliente; trocá-los invalida evidência acumulada.

## Decisão

### Fixed-point com escala declarada

O caminho autoritativo é inteiro. Ponto flutuante é proibido em estado, comando, evento autoritativo, save, replay e hash.

Cada quantidade declara sua **escala** como potência de dez no contrato que a define. `milli` deixa de ser convenção presumida e passa a ser o valor padrão explícito. Valor que atravessa boundary carrega a escala; converter por conhecimento implícito do nome é proibido, e mistura de escalas é `DETERMINISM_SCALE_MISMATCH`.

Regras de aritmética:

- multiplicação e divisão usam intermediário largo declarado, nunca truncamento acidental de `int64`;
- arredondamento é `half-away-from-zero`, declarado e coberto por fixture, nunca dependente do compilador;
- overflow permanece diagnóstico, como já ocorre no commit; saturação silenciosa é proibida;
- divisão por zero é diagnóstico, não valor especial.

Ponto flutuante continua permitido apenas em apresentação, depois da conversão no boundary do projector.

### Streams de PRNG com separação de domínio

Não existe RNG global. Toda extração vem de um **stream** identificado, derivado por função pura:

```text
stream = derive(rootSeed, domainId, instanceId)
```

A derivação usa SplitMix64, cuja finalidade é justamente semear; o motor de cada stream é xoshiro256++. Ambos são inteiros, portáveis, de domínio público e não dependem de biblioteca externa. Extração em faixa usa amostragem com rejeição; `%` sobre a saída bruta é proibido por introduzir viés — `RNG_MODULO_BIAS`.

Separação de domínio é a propriedade central: adicionar um sistema novo, um chunk novo ou um agente novo não pode deslocar os números de nenhum stream existente. Um stream não declarado é `RNG_STREAM_UNDECLARED` no carregamento.

A posição de cada stream faz parte do estado salvo e entra no hash. Replay restaura posições; consumo fora de ordem é divergência detectável, não ruído.

### Prova obrigatória

Golden vectors são fixtures do repositório: para `rootSeed` fixo, os primeiros N valores de cada domínio, mais os casos de arredondamento e de faixa. Eles rodam em native e em WebAssembly, e divergência é `RNG_GOLDEN_VECTOR_MISMATCH` ou `DETERMINISM_GOLDEN_VECTOR_MISMATCH`, nunca tolerância.

### O que não é prometido

Este ADR garante determinismo do caminho autoritativo entre os targets suportados. Ele não promete determinismo de solver físico, que é decidido pelo ADR de física, nem de apresentação, nem de qualquer cálculo em ponto flutuante fora do caminho autoritativo.

Códigos: `DETERMINISM_FLOAT_IN_AUTHORITATIVE_PATH`, `DETERMINISM_SCALE_MISMATCH`, `DETERMINISM_OVERFLOW`, `DETERMINISM_GOLDEN_VECTOR_MISMATCH`, `RNG_STREAM_UNDECLARED`, `RNG_GOLDEN_VECTOR_MISMATCH`, `RNG_MODULO_BIAS`.

## Consequências

- a convenção `milli` implícita nos nomes vira escala declarada em contrato;
- o SDK do ADR 0016 pode expor streams sem fixar algoritmo por acidente;
- geração de chunk, distribuição procedural e sincronização por seed ganham base comum;
- adicionar sistema ou entidade deixa de poder alterar números de outro sistema;
- save, replay e hash passam a incluir posição de stream, o que exige migração dos formatos quando isso entrar;
- golden vectors tornam-se gate de CI native e WASM;
- solver físico continua fora dessa garantia e exigirá prova própria.

## Alternativas rejeitadas

- **Ponto flutuante com epsilon no caminho autoritativo:** torna hash, replay e comparação host/cliente dependentes de compilador, FMA e ordem de operações.
- **RNG global compartilhado:** qualquer sistema novo desloca a sequência de todos os outros e quebra replays antigos por construção.
- **Manter `milli` como convenção por nome:** já produziu quatro campos com escala presumida e falha em silêncio na primeira quantidade que precisar de outra precisão.
- **Mersenne Twister:** estado grande, semeadura lenta e comportamento ruim para milhares de streams curtos, que é exatamente o caso de chunks e agentes.
- **`math.random` do Lua ou `rand()` da libc:** implementação dependente de plataforma, sem golden vector possível.
- **`%` para faixa:** introduz viés mensurável em faixas que não dividem a potência de dois.
- **Fixed-point global em uma única escala:** ou desperdiça faixa em quantidades grandes, ou perde precisão nas pequenas.
