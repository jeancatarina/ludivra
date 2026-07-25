# Aleatoriedade e aritmética determinística

O caminho autoritativo é inteiro. Gameplay nunca usa ponto flutuante nem um RNG
global: as duas coisas quebrariam hash, save e replay entre execuções e entre
targets. As decisões estão no [ADR 0018](../adr/0018-numeric-determinism-and-rng-streams.md).

## Sorteio por domínio

```lua
-- Faixa inclusiva a partir de um stream nomeado.
local dano = ctx.random:range("combat.damage", 1, 6)

-- Valor unitário na escala milli: 0 a 1000, nunca 0.0 a 1.0.
local chance = ctx.random:unit_milli("loot.drop")

-- O quinto argumento separa instâncias do mesmo domínio.
local por_inimigo = ctx.random:range("combat.damage", 1, 6, inimigo_id)
```

O nome do domínio é o que garante a propriedade central: **adicionar um sorteio
novo não desloca a sequência de nenhum outro**. Um sistema que passe a sortear
hoje não muda o resultado de um replay gravado ontem por outro sistema.

A posição de cada stream entra no hash de estado e viaja no save. Consumir um
sorteio a mais, ou a menos, é divergência detectável, não ruído.

## Aritmética com escala declarada

```lua
-- Multiplicação e divisão na escala milli, que é o padrão declarado.
local escalado = ctx.fixed:mul(valor_milli, 1500)   -- valor * 1.5
local media    = ctx.fixed:div(total_milli, 3)

-- Converter entre escalas é explícito.
local em_deci = ctx.fixed:rescale(valor_milli, 3, 1)
```

Arredondamento é *half away from zero*. Overflow, divisão por zero e escala não
suportada são erros de script com mensagem, nunca saturação silenciosa.

## O que continua proibido

- `math.random` e `math.randomseed`, removidos pelo sandbox do [ADR 0004](../adr/0004-lua-sandbox.md);
- ponto flutuante em estado, comando, save, replay ou hash;
- ler relógio civil para decidir regra.

## Evidência

Os golden vectors ficam em `tests/fixtures/rng-golden.json` e são verificados por
duas implementações independentes — o kernel em C++ e o pacote de authoring em
TypeScript — pelo comando `pnpm test:rng`. A equivalência entre native e
WebAssembly roda em `pnpm test:wasm-equivalence`.
