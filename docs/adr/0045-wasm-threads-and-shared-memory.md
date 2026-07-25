# ADR 0045 — Threads e memória compartilhada no WebAssembly

- Status: provisório
- Data: 2026-07-24
- Revisão: ao registrar benchmark do boundary de worker na Fase 6, ou se um target exigir threads para caber no budget
- Fecha a pendência de: [ADR 0020](0020-presentation-buffers-and-wasm-memory.md)
- Fase: 6

## Contexto

O ADR 0020 decidiu buffers de apresentação de registro fixo com leitura por view sobre a heap do módulo, sem cópia, dentro de uma janela de empréstimo por frame. Ele registrou que cópia permanece obrigatória ao atravessar boundary de worker e que adotar `SharedArrayBuffer` exigiria ADR próprio com benchmark.

Essa pendência importa porque o ADR 0019 prevê jobs assíncronos de geração e meshing, e alguém pode concluir que jobs implicam threads no WebAssembly.

O custo de `SharedArrayBuffer` não é técnico apenas: ele exige que **todo servidor que sirva o jogo** responda com os cabeçalhos COOP e COEP. Um jogo hospedado em um site simples, em um servidor de arquivos estático de itch ou em uma pasta local deixa de funcionar. Para uma engine cujo alvo é o jogo publicado por uma pessoa, isso é uma restrição de distribuição, não um detalhe de build.

## Decisão

### A versão 1 não adota threads no WebAssembly

Não haverá `SharedArrayBuffer`, `pthreads` do Emscripten nem memória compartilhada entre workers na versão 1. A decisão é para o escopo atual, com condição de revisão declarada, não uma pendência aberta.

Consequência direta: o build WebAssembly permanece single-threaded, e um jogo publicado continua funcionando em hospedagem estática sem cabeçalhos especiais.

### Jobs assíncronos sem threads compartilhadas

Os jobs do ADR 0019 rodam de duas formas, ambas sem memória compartilhada:

1. **fatiados no próprio thread**, com orçamento por tick e commit no boundary determinístico — é o caminho padrão;
2. **em worker separado**, comunicando por mensagem e cópia, quando a tarefa for longa e recortável, como geração de chunk ou compressão.

A ordem de commit continua determinística por chave, conforme o ADR 0019, então a escolha entre 1 e 2 não altera o resultado do mundo. Isso é o que permite trocar a estratégia depois sem invalidar replays.

### Cópia é o contrato do boundary de worker

Atravessar worker copia, e a cópia é medida. `postMessage` com transferência de `ArrayBuffer` é permitida quando o buffer é descartado pelo produtor, porque isso é transferência de posse, não compartilhamento.

### O que abriria a decisão

A revisão exige benchmark, conforme o ADR 0029, mostrando que a cópia no boundary de worker é o gargalo real do budget de um target declarado — não que threads seriam teoricamente mais rápidas. Se isso ocorrer, threads entram como capability opt-in, com o jogo declarando que exige hospedagem com COOP e COEP, e com caminho single-threaded preservado.

Código: `WASM_SHARED_MEMORY_NOT_AVAILABLE`.

## Consequências

- o jogo publicado continua funcionando em hospedagem estática simples;
- o build WebAssembly permanece um único artefato, sem variante com threads para manter;
- jobs de mundo têm estratégia decidida sem depender de threads;
- determinismo permanece independente da estratégia de execução do job;
- o `ArrayBuffer` transferido cobre o caso de dado grande sem introduzir compartilhamento;
- se o benchmark justificar, threads entram como capability declarada, e o custo de hospedagem fica explícito para o jogo.

## Alternativas rejeitadas

- **Adotar `SharedArrayBuffer` agora:** impõe COOP e COEP a qualquer publicação, sem benchmark que prove necessidade.
- **Manter dois builds, com e sem threads:** dobra matriz de teste e cria divergência de comportamento entre eles.
- **Rodar job longo direto no thread principal sem fatiar:** produz travada visível, exatamente o que o percentil P99 mede.
- **Deixar a decisão aberta:** manteria uma dependência não resolvida no meio das Fases 5 e 6.
