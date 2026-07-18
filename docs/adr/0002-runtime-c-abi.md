# ADR 0002 — C ABI mínima do runtime

- Status: provisório
- Data: 2026-07-18
- Revisão: antes da primeira bridge WebAssembly pública

## Contexto

Hosts nativos e WebAssembly precisam acessar o kernel sem expor classes, STL, exceptions ou ownership C++.

## Decisão

Expor uma C ABI versionada com handle opaco, configuração por struct, códigos de erro e funções explícitas de create/destroy/input/step/inspect. O primeiro contrato comprova tick e hash determinístico; buffers de apresentação serão adicionados apenas com schema próprio.

## Consequências

- ownership do runtime fica explícito;
- o teste de boundary não depende de internals do kernel;
- mudanças incompatíveis exigem nova versão de ABI;
- o contrato inicial permanece deliberadamente pequeno.

