# ADR 0041 — Mecanismo de bindings da C ABI

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de promover a C ABI a estável, ou ao adicionar um consumidor em linguagem nova
- Fecha a pendência de: [ADR 0002](0002-runtime-c-abi.md) e o item correspondente da seção 36 de [architecture.md](../../architecture.md)
- Fase: pré-requisito de qualquer host novo

## Contexto

`runtime-c-api/include/ludivra/runtime.h` é escrito à mão e expõe `ludivra_runtime_abi_version`. Já existe também um header gerado a partir de contrato, `presentation_events.h`, produzido por `tools/contracts/` junto do tipo TypeScript e do header do kernel.

Há portanto dois regimes no mesmo boundary: uma parte do ABI é escrita à mão e replicada manualmente em cada consumidor, e outra é gerada de uma fonte única. O `runtime-web` mantém sua própria descrição das funções e dos tamanhos de struct para chamar o módulo WebAssembly, e nada garante mecanicamente que ela corresponda ao header.

Essa divergência é silenciosa por construção: um campo adicionado no meio de um struct compila em C e produz leitura deslocada no TypeScript.

## Decisão

### Uma descrição, vários bindings gerados

A superfície da C ABI passa a ser descrita em um contrato único em `contracts/runtime-abi.schema.json`: versão do ABI, funções com parâmetros e retornos, códigos de erro, structs com campos, tipos e tamanho total, e limites.

De lá, `tools/contracts/generate-runtime-abi.mjs` gera:

- o header C público consumido pelos hosts nativos;
- os tipos e os offsets usados pelo `runtime-web` para falar com o módulo WebAssembly;
- as constantes que o kernel usa para afirmar tamanho e ordem dos campos.

Descrição manual paralela de função, struct, offset ou código de erro passa a ser proibida, como já vale para os demais contratos.

### Verificação estática do layout

O kernel gera asserções de tamanho e offset a partir do contrato — falha de compilação quando o C real divergir da descrição. O `runtime-web` valida em teste que os offsets que usa vêm do binding gerado.

É essa dupla verificação que transforma um erro de layout em falha de build em vez de leitura deslocada em runtime.

### Versão e compatibilidade

`ludivra_runtime_abi_version` passa a ser gerada do contrato. Mudança incompatível incrementa a versão; adição compatível não. Um host que carregue uma versão que não suporta falha com diagnóstico explícito, nunca por tentativa.

### Linguagem nova

Consumidor em linguagem nova adiciona um emissor ao gerador, não um binding escrito à mão. `game validate` já executa os geradores em modo `--check`, portanto binding desatualizado passa a ser `GENERATED_FILE_STALE`.

Códigos: `ABI_CONTRACT_INVALID`, `ABI_LAYOUT_MISMATCH`, `ABI_VERSION_UNSUPPORTED`, `ABI_BINDING_HANDWRITTEN`.

## Consequências

- o boundary mais frágil da engine ganha fonte única e verificação de layout;
- `runtime-web` deixa de repetir offsets à mão;
- adicionar campo em struct passa a ser mudança revisável em um contrato, não em três lugares;
- host nativo futuro e `NativeDiagnosticHost` consomem o mesmo header gerado;
- a promessa aberta do ADR 0002 fica cumprida;
- migrar o header atual para o contrato é trabalho de uma etapa, com o header antigo removido no mesmo change set.

## Alternativas rejeitadas

- **Manter o header à mão e confiar em revisão:** já produziu duas descrições do mesmo ABI, e a divergência é silenciosa.
- **Gerar a partir do header C:** exigiria parser de C no repositório e trataria implementação como contrato.
- **Adotar SWIG, cbindgen ou equivalente:** dependência de ferramenta grande para um ABI deliberadamente pequeno, e nenhuma delas resolveria os offsets do lado WebAssembly do jeito que o gerador próprio resolve.
- **Descrever o ABI em TypeScript:** faria o consumidor definir o contrato do produtor, invertendo a direção de dependência.
