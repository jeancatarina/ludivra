# ADR 0002 — C ABI mínima do runtime

- Status: provisório
- Data: 2026-07-18
- Revisão: antes da primeira versão estável; o mecanismo de bindings da C ABI continua pendente na seção 36 de [architecture.md](../../architecture.md)
- Estendido por: [ADR 0020](0020-presentation-buffers-and-wasm-memory.md), que cumpre a promessa de schema próprio para buffers de apresentação

## Contexto

Hosts nativos e WebAssembly precisam acessar o kernel sem expor classes, STL, exceptions ou ownership C++.

## Decisão

Expor uma C ABI versionada com handle opaco, configuração por struct, códigos de erro e funções explícitas de create/destroy/input/step/inspect. Funções aditivas carregam o módulo Lua, consultam estado inteiro e expõem o último erro. Buffers de apresentação serão adicionados apenas com schema próprio.

## Consequências

- ownership do runtime fica explícito;
- o teste de boundary não depende de internals do kernel;
- mudanças incompatíveis exigem nova versão de ABI;
- o contrato inicial permanece deliberadamente pequeno.
