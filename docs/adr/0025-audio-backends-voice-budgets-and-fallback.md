# ADR 0025 — Backends de áudio, budgets de voz e fallback observável

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de declarar suporte a áudio em um target novo
- Complementa: [ADR 0007](0007-semantic-audio-and-effects.md)
- Fecha: item "backend de áudio por host" da seção 36 de [architecture.md](../../architecture.md)
- Fase: 8

## Contexto

O ADR 0007 decidiu o que importa primeiro: gameplay emite eventos numéricos, o kernel produz um lote ordenado com sequência monotônica, o manifest mapeia IDs para definições semânticas e o BrowserHost implementa o primeiro backend em Web Audio. Eventos entram no hash e não há objeto de áudio no save.

O que ficou aberto é o comportamento sob carga e sob ausência. Nada define quantas vozes podem soar, o que acontece quando o mesmo evento dispara cinquenta vezes no mesmo tick, qual backend cada host usa fora do navegador, e o que a sessão observa quando o dispositivo de áudio não existe — caso comum em runner de CI e em máquina headless.

Sem essa decisão, a Fase 8 não consegue distinguir "o evento não foi emitido" de "foi emitido e não soou".

## Decisão

### Backend por host

| Host | Backend | Situação |
|---|---|---|
| BrowserHost | Web Audio | existente |
| ElectronHost | Web Audio do próprio renderer | existente por herança |
| adapter headless | backend nulo instrumentado | decidido aqui |
| nativo futuro | adapter próprio com ADR | fora do escopo |

O backend nulo instrumentado é a decisão central para observabilidade: ele resolve, prioriza e contabiliza tudo como um backend real e não emite som. Isso permite que cenário e CI verifiquem resolução de evento, budget e dedução de prioridade sem dispositivo de áudio.

Backend nulo nunca é escolhido silenciosamente em host com áudio: seleção é declarada e aparece no manifest do run.

### Prioridade, deduplicação e budget

Cada definição declara prioridade e janela de deduplicação. Eventos idênticos dentro da janela colapsam, e o número de colapsos é reportado — nunca descartado sem contagem.

Cada target declara budget de vozes simultâneas e de memória de áudio. Ao exceder, a decisão é determinística: a voz de menor prioridade e mais antiga cede. Nunca a mais recente por acidente de ordem de chegada.

O evento continua no hash conforme o ADR 0007. **Colapso, corte por budget e escolha de voz são decisões de apresentação e não podem alterar o lote de eventos autoritativo**, o que mantém replay estável entre hosts com budgets diferentes.

### Fallback observável

Dispositivo ausente, contexto suspenso por falta de gesto do usuário, arquivo ausente e decodificação falha são estados declarados e diagnosticados, cada um com código próprio. Nenhum deles pode ser tratado como sucesso silencioso.

Evento cujo ID não existe no manifest é `AUDIO_EVENT_UNRESOLVED` — defeito de conteúdo, não silêncio.

### Evidência

Captura de áudio para evidência é forma de dado, não gravação de sessão: contagem de vozes por bus, eventos resolvidos e não resolvidos, colapsos, cortes por budget e envelope agregado. Waveform e espectro entram quando houver consumidor material — validação de loop e LUFS pertencem ao Audio Forge, não a este ADR.

Códigos: `AUDIO_EVENT_UNRESOLVED`, `AUDIO_VOICE_BUDGET_EXCEEDED`, `AUDIO_MEMORY_BUDGET_EXCEEDED`, `AUDIO_DEVICE_UNAVAILABLE`, `AUDIO_CONTEXT_SUSPENDED`, `AUDIO_ASSET_DECODE_FAILED`, `AUDIO_BACKEND_NULL_SELECTED`.

## Consequências

- áudio passa a ser verificável sem dispositivo, o que o torna testável em CI;
- comportamento sob carga deixa de ser propriedade emergente do navegador;
- replay permanece idêntico entre hosts com budgets diferentes;
- a diferença entre evento não emitido e evento não audível fica registrada em dado;
- cada target passa a declarar budget de vozes antes de alegar suporte a áudio;
- backends nativos futuros permanecem possíveis sem alterar gameplay;
- análise espectral fica reservada ao Forge, evitando dependência de DSP no host.

## Alternativas rejeitadas

- **Deixar o navegador decidir corte de vozes:** comportamento diferente por motor, invisível ao diagnóstico.
- **Colapsar eventos no kernel:** mudaria o lote autoritativo e faria o replay depender do budget do host.
- **Escolher backend nulo automaticamente ao falhar:** converteria falha de dispositivo em execução aparentemente bem-sucedida.
- **Cortar sempre a voz mais recente:** produz perda do feedback mais relevante, que é normalmente o último evento.
- **Tratar arquivo ausente como silêncio:** esconde erro de conteúdo até a revisão final.
- **Gravar áudio da sessão como evidência padrão:** artefato grande e difícil de comparar, quando contagens e envelope respondem à pergunta.
- **Colocar análise de LUFS e espectro no host:** dependência de DSP no runtime para um problema de authoring.
