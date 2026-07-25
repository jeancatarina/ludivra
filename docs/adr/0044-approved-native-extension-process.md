# ADR 0044 — Extensão nativa aprovada: processo e fronteira

- Status: provisório
- Data: 2026-07-24
- Revisão: após a primeira extensão nativa aprovada
- Fecha a pendência de: [ADR 0016](0016-public-lua-sdk-layers-and-escape-hatches.md)
- Complementa: [ADR 0002](0002-runtime-c-abi.md) e [ADR 0012](0012-feature-first-roadmap-and-proof-games.md)

## Contexto

A escada de escape hatches do ADR 0016 termina em "extensão nativa aprovada por ADR". Isso descreve um requisito sem descrever o processo: não diz o que precisa ser provado, por onde a extensão entra, o que ela pode acessar, nem o que acontece quando ela não está disponível.

Sem esse processo, o último degrau é ou um portão fechado que ninguém sabe abrir, ou uma porta que a primeira urgência escancara.

## Decisão

### Prova exigida antes do ADR da extensão

Um pedido de extensão nativa precisa apresentar, em ordem:

1. o degrau anterior implementado e medido, mostrando por que JSONC, capability, Lua, projector e TypeScript de apresentação são insuficientes — insuficiência declarada sem medição não conta;
2. benchmark com profile declarado conforme o ADR 0029, comparando a solução no degrau anterior com o protótipo nativo;
3. justificativa além de um jogo, conforme o ADR 0012;
4. avaliação de portabilidade para todos os targets declarados, incluindo WebAssembly;
5. plano de fallback quando a extensão não estiver disponível.

Sem os cinco itens, o pedido é recusado sem ADR.

### Fronteira técnica

A extensão entra exclusivamente pela C ABI descrita pelo ADR 0041, como módulo separado com versão própria. Ela **não**:

- é compilada dentro do kernel;
- recebe acesa a internals do kernel, a STL do kernel ou a estruturas não descritas em contrato;
- lê ou escreve estado autoritativo fora do boundary de commit;
- consome RNG fora de um stream declarado pelo ADR 0018;
- acessa filesystem, rede ou SDK de plataforma sem passar pelo host.

Extensão que precise de qualquer um desses itens não é extensão: é mudança de kernel, e segue o processo de kernel.

### Determinismo e evidência

Se a extensão participa do caminho autoritativo, ela precisa de golden vectors e de equivalência native/WASM, como qualquer parte do kernel. Se não participa, ela é apresentação e não pode alterar hash, save nem replay.

Toda extensão aparece no catálogo de capabilities com owner, targets, contratos, limitações e comandos de verificação, e sua ausência é `NOT_AVAILABLE` explícito.

### Fallback obrigatório

Todo jogo que declare uma extensão nativa declara também o comportamento sem ela: recusar a execução com diagnóstico, ou operar em modo reduzido declarado. Ausência silenciosa é proibida.

Códigos: `NATIVE_EXTENSION_NOT_APPROVED`, `NATIVE_EXTENSION_ABI_VIOLATION`, `NATIVE_EXTENSION_TARGET_UNSUPPORTED`, `NATIVE_EXTENSION_UNAVAILABLE`, `NATIVE_EXTENSION_FALLBACK_UNDECLARED`.

## Consequências

- o último degrau da escada passa a ter porta com fechadura, não muro nem porta aberta;
- extensão nativa não pode crescer para dentro do kernel por conveniência;
- benchmark comparativo passa a ser condição de entrada, não argumento retórico;
- WebAssembly permanece target de primeira classe, porque portabilidade é item da prova;
- jogo com extensão declara o que acontece sem ela;
- a primeira extensão aprovada revisa este processo com evidência real.

## Alternativas rejeitadas

- **Permitir extensão nativa por decisão local:** o degrau mais caro se tornaria o mais fácil de subir.
- **Proibir extensão nativa em definitivo:** deixaria um jogo legítimo sem saída quando a medição realmente justificar.
- **Compilar a extensão dentro do kernel:** acopla código específico ao estado autoritativo reutilizável.
- **Aceitar extensão sem fallback:** transforma indisponibilidade de plataforma em falha inexplicável para o jogador.
