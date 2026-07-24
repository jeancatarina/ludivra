# ADR 0020 — Buffers de apresentação e memória WebAssembly

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de exigir `SharedArrayBuffer` ou de adicionar um segundo mecanismo de transporte de frame
- Complementa: [ADR 0002](0002-runtime-c-abi.md) e [ADR 0007](0007-semantic-audio-and-effects.md)
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md)
- Fecha: itens "presentation buffers" e "estratégia de memória compartilhada/cópia no WASM" da seção 36 de [architecture.md](../../architecture.md)
- Fases: 6 e 8

## Contexto

O ADR 0002 fixou a C ABI mínima e registrou que buffers de apresentação seriam adicionados apenas com schema próprio. Esse schema não existe.

O que existe é um precedente bom: `contracts/presentation-events.schema.json` declara `protocolVersion`, `recordSize` de 40 bytes, `maxBufferedEvents` e os tipos de evento como constantes, e o gerador em `tools/contracts/` produz o header C, o tipo TypeScript e o header do kernel a partir dele. Registro de tamanho fixo com versão e contrato único já é o padrão da casa.

O que não escala é o boundary atual do WebAssembly. Cada chamada de `runtime-web` aloca com `_malloc`, escreve em `HEAPU8` por `DataView` e libera. Isso é adequado para um input por tick e inviável para milhares de visuais por frame, que é a exigência do Mass Runtime e do renderer instanciado.

`SharedArrayBuffer` seria a resposta óbvia para threads, mas exige cabeçalhos COOP e COEP no host que serve o jogo. Isso é uma restrição de publicação, não uma escolha técnica isolada.

## Decisão

### Buffers versionados de registro fixo

Buffers de apresentação são declarados em contrato próprio, seguindo o padrão de `presentation-events`: `protocolVersion`, `recordSize` por tipo de buffer, capacidade máxima e enumerações como constantes, com header C, tipo TypeScript e header de kernel gerados pelo mesmo mecanismo. Definição manual paralela em qualquer consumidor é proibida.

Os tipos iniciais cobrem transform de visual, estado de visual, animação e instância. Cada tipo declara seu registro completo; campo opcional dentro do registro é proibido, porque destruiria o tamanho fixo.

### Direção e autoridade

Buffers são produzidos pelo projector read-only depois do commit do tick e consumidos pelo renderer. Eles não entram em save, não entram no hash autoritativo e não podem ser lidos pelo gameplay. Um buffer nunca é canal de volta: intent de UI e input seguem seus próprios contratos.

Números em buffer podem ser ponto flutuante, porque já estão fora do caminho autoritativo; a conversão a partir do fixed-point acontece no projector, conforme o ADR 0018.

### Memória no WebAssembly

O consumo padrão é **leitura por view sobre a heap do módulo, sem cópia**, dentro de uma janela de empréstimo explícita por frame. Fora dessa janela a view é inválida, porque crescimento da heap troca o `ArrayBuffer` subjacente. Reter view entre frames é `PRESENTATION_VIEW_RETAINED`.

Cópia permanece o caminho obrigatório em duas situações declaradas: atravessar boundary de worker e persistir qualquer amostra para evidência. `SharedArrayBuffer` e memória compartilhada entre threads **não** são exigidos por esta decisão, porque obrigariam todo host que sirva o jogo a configurar COOP e COEP. Adotá-los exige ADR próprio com benchmark que demonstre que a cópia no boundary de worker é o gargalo real.

### Capacidade e degradação

Capacidade é declarada, e estouro é diagnóstico com contagem, não descarte silencioso do excedente. Quando a capacidade for atingida, a degradação segue a política de budget da apresentação: reduzir detalhe declaradamente, nunca alterar estado lógico.

Códigos: `PRESENTATION_BUFFER_VERSION_MISMATCH`, `PRESENTATION_BUFFER_RECORD_SIZE_MISMATCH`, `PRESENTATION_BUFFER_OVERFLOW`, `PRESENTATION_VIEW_RETAINED`, `PRESENTATION_BUFFER_NOT_DECLARED`.

## Consequências

- a promessa aberta do ADR 0002 é cumprida com schema, versão e bindings gerados;
- apresentação massiva deixa de pagar `_malloc` e cópia por objeto por frame;
- o renderer passa a poder alimentar instancing diretamente a partir de memória contígua;
- a janela de empréstimo entra no contrato do renderer e vira teste de boundary;
- hosts continuam publicáveis sem COOP e COEP;
- threads e `SharedArrayBuffer` permanecem disponíveis como decisão futura com benchmark;
- estouro de buffer torna-se dado observável, alinhado aos budgets da Fase 8.

## Alternativas rejeitadas

- **Manter objeto por visual por frame:** custo de alocação e travessia proporcional à cena, inviável para hordas e instancing.
- **JSON ou payload textual por frame:** serialização e parse por frame no caminho mais quente do sistema.
- **Exigir `SharedArrayBuffer` agora:** impõe COOP e COEP a qualquer publicação do jogo, antes de existir benchmark que prove a necessidade.
- **Permitir view retida entre frames:** produz leitura de memória movida após crescimento da heap, com falha intermitente e difícil de atribuir.
- **Registro com campo opcional:** elimina o tamanho fixo e reintroduz parse por registro.
- **Buffer como canal bidirecional:** transformaria o renderer em produtor de estado e violaria a direção obrigatória de dependências.
- **Colocar buffer em save ou hash:** contaminaria estado autoritativo com dado de apresentação descartável.
