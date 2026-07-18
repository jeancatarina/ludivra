# ADR 0001 — Build da fundação

- Status: provisório
- Data: 2026-07-18
- Revisão: após o primeiro build WebAssembly

## Contexto

A fundação precisa compilar C++20, executar testes nativos e construir uma CLI TypeScript sem adicionar dependência de runtime à engine.

## Decisão

Usar CMake com Ninja para C++ e pnpm workspace para TypeScript. Toolchains ficam registradas em `toolchain.lock`. CMake deve manter uma fronteira compatível com Emscripten, ainda não instalado.

## Consequências

- build nativo funciona imediatamente com ferramentas presentes;
- TypeScript e tipos do Node são dependências apenas de desenvolvimento;
- a decisão será reavaliada com evidência do spike WASM;
- nenhuma API de jogo depende do sistema de build.

