# ADR 0001 — Build da fundação

- Status: aceito
- Data: 2026-07-18
- Revisão: antes de publicar a primeira versão estável

## Contexto

A fundação precisa compilar C++20, executar testes nativos e construir uma CLI TypeScript sem adicionar dependência de runtime à engine.

## Decisão

Usar CMake com Ninja para C++ e pnpm workspace para TypeScript. Toolchains ficam registradas em `toolchain.lock`. Emscripten é instalado localmente, com versão fixa, por `tools/deps/bootstrap-emsdk.sh`.

## Consequências

- build nativo funciona imediatamente com ferramentas presentes;
- TypeScript e tipos do Node são dependências apenas de desenvolvimento;
- builds native e WASM usam o mesmo grafo CMake;
- nenhuma API de jogo depende do sistema de build.
