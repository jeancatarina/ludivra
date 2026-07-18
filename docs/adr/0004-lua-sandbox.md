# ADR 0004 — Lua 5.4.8 e mutação por comandos

- Status: aceito
- Data: 2026-07-18

## Contexto

Gameplay criado por agentes precisa iterar rápido sem receber acesso irrestrito ao host ou quebrar determinismo.

## Decisão

Fixar Lua 5.4.8 pelo tarball oficial e SHA-256. O kernel abre somente bibliotecas seguras, remove RNG e carregamento dinâmico, aplica orçamento de 100.000 instruções por callback e não expõe filesystem, rede, sistema operacional ou relógio. Scripts consultam estado por `ctx.query` e solicitam mudanças por `ctx.commands`; o kernel valida e aplica o lote.

## Consequências

- scripts não podem alterar estruturas internas diretamente;
- falhas Lua retornam código público e mensagem inspecionável;
- o mesmo módulo executa nas builds C++ e WebAssembly;
- novas APIs Lua exigem consumidor real, contrato, teste nativo e equivalência WASM.
