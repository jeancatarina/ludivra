# ADR 0032 — Audio Forge: receitas textuais e renderizador determinístico

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de adicionar provedor neural de áudio ou streaming de música
- Especializa: [ADR 0027](0027-forge-output-contract-and-authoring-boundary.md)
- Complementa: [ADR 0007](0007-semantic-audio-and-effects.md) e [ADR 0025](0025-audio-backends-voice-budgets-and-fallback.md)
- Backlog: `AUD-001`
- Fase: 10, utilizável a partir da Fase 4

## Contexto

A engine já possui um **player** de áudio, não um gerador. O `ENG-008` entregou eventos semânticos `play_audio`/`stop_audio`, buses de música, ambiente e efeitos, carregamento de arquivos, reprodução por Web Audio e um `synth` mínimo. O manifest aceita exatamente uma de duas fontes por definição: `source` com um arquivo, ou `synth` com uma forma de onda, uma frequência e uma duração.

Esse `synth` é um placeholder: não tem envelope, ruído, filtro, modulação, camadas nem composição. Para um jogo real ele só serve quando o bipe é intencionalmente o estilo.

O que falta não é backend de reprodução — é autoria. E autoria por agente exige que a fonte de verdade seja um documento textual, não um arquivo de áudio. Um modelo descreve "impacto de clava em goblin, madeira e osso, com cauda curta" com facilidade; ele não produz cinquenta mil amostras PCM de forma confiável, revisável ou determinística.

A arquitetura já reserva o lugar correto: assets podem ter origem `generated`, com licença, hash, targets e pipeline de validação e cooker.

## Decisão

### A receita é a fonte de verdade

Um som é descrito por `audio/*.audio.jsonc`, validado por `schemas/audio-recipe.schema.json`, com id semântico, seed, perfil de render, camadas, efeitos e master. Música usa `schemas/music-recipe.schema.json` com tempo, compasso, tonalidade, escala, loop e trilhas de notas ou geradores rítmicos.

Nenhuma amostra de áudio aparece na receita. A receita descreve **como sintetizar**, não o resultado.

### O manifest ganha `recipe` como terceira fonte

`game.jsonc` passa a aceitar exatamente uma de três: `source`, `synth` ou `recipe`. O `synth` atual continua válido como atalho, mas é **convertido internamente para uma receita** e renderizado pelo mesmo compilador. Duas implementações de síntese são proibidas: o compilador é o único lugar onde som é gerado.

### O compilador vive no plano de autoria, em TypeScript

O `audio-authoring` é um pacote TypeScript executado pela CLI em authoring ou build time. Ele não entra no kernel, não entra em Lua, não entra no renderer e não roda durante o jogo.

A escolha de TypeScript é deliberada: o plano de autoria não é caminho crítico de runtime, o Node já está fixado pela toolchain, o resultado é testável sem navegador, e é a linguagem em que um agente edita com mais segurança. A regra da casa continua valendo — algo só desce para o kernel quando TypeScript ou Lua se mostrarem inadequados por medição.

O render trabalha em `Float32Array` internamente e converte para PCM apenas na escrita.

### Grafo de síntese mínimo

Nós: oscilador, ruído, envelope, envelope de pitch, ganho, filtro biquad, distorção, modulador em anel, modulador de frequência, ressonador, delay, reverb simples, compressor, limitador, pan estéreo e mixer.

Osciladores: `sine`, `triangle`, `square`, `pulse`, `sawtooth`. Ruídos: `white`, `pink`, `brown`, `metallic`, `sample-and-hold`.

Todo ruído e toda variação usam PRNG com seed derivada pelo domínio declarado do [ADR 0018](0018-numeric-determinism-and-rng-streams.md). `Math.random` é proibido: sem isso o mesmo som não se reproduz.

### Música como partitura, não como amostras

Música é composição semelhante a tracker: tempo, compasso, tonalidade, escala, loop, trilhas com notas em beats ou geradores — por exemplo ritmo euclidiano — e patches de instrumento. O render produz mix final e, quando declarado, stems separados, para que o runtime possa cruzar camadas conforme o estado do jogo.

### Cache e local dos arquivos

```text
audio/recipes/                    receitas versionadas no Git
.ludivra/cache/audio/<hash>.wav   cache local regenerável e ignorado
build/assets/audio/               arquivos consumidos pelo build
reports/runs/<runId>/audio/       previews e evidência do run
```

Somente receitas são obrigatórias no Git. O cache pertence à família `audio` do cache de artefatos do [ADR 0013](0013-development-runner-cache-and-lifecycle.md), com chave `hash(receita) + versão do gerador + seed + perfil`.

O Vite deixa de assumir que todo áudio vem de `audio.source`: ele recebe do cooker um mapa já resolvido de `eventId` para asset compilado.

### Comandos

```bash
game audio render   --project <p> [--id <audioId>]
game audio preview  --project <p> --id <audioId>
game audio inspect  --project <p>
```

`game build` e `game run` renderizam automaticamente receitas desatualizadas. A saída é estruturada com id, receita, arquivo, duração, sample rate, pico e sha256.

### Evidência por render

Cada render produz `preview.wav`, `waveform.png`, `spectrogram.png` e `audio-analysis.json`, e o relatório verifica clipping, silêncio acidental, DC offset, duração, pico, volume médio, descontinuidade no ponto de loop, tamanho final e hash determinístico.

É essa evidência que fecha o ciclo: o agente pede o som, lê a análise, ajusta a receita e repete sem ouvir o arquivo.

### O runtime é reaproveitado, não reescrito

`hosts/browser/src/audio-feedback.ts` é extraído para `audio-runtime-web`. O host passa a apenas criar o runtime e entregar eventos. Efeito curto continua em `AudioBuffer` pré-carregado; música e ambiente longos passam a streaming, porque decodificar faixas inteiras infla memória e startup. Budgets de voz, prioridade, dedução e fallback permanecem os do ADR 0025.

Este ADR **não** altera o kernel: o contrato `play_audio`/`stop_audio` já é suficiente. Áudio espacial por evento, com posição e listener, é ampliação posterior do protocolo de apresentação.

Códigos: `AUDIO_RECIPE_INVALID`, `AUDIO_RECIPE_NONDETERMINISTIC`, `AUDIO_RENDER_CLIPPING`, `AUDIO_RENDER_SILENT`, `AUDIO_RENDER_DC_OFFSET`, `AUDIO_LOOP_DISCONTINUITY`, `AUDIO_RECIPE_STALE`, `AUDIO_GENERATOR_VERSION_UNSUPPORTED`.

## Consequências

- um agente cria e varia sons por texto, sem baixar asset externo e sem editar bytes;
- o `synth` do manifest deixa de ser uma segunda implementação de síntese;
- o repositório versiona receitas pequenas em vez de binários;
- variação por seed torna quatro versões de um impacto um detalhe de parâmetro;
- o gate de release ganha análise objetiva de clipping, loop e nível;
- música com stems abre caminho para música adaptativa sem mudar gameplay;
- o BrowserHost deixa de ser responsável por definir som e passa a apenas reproduzir o que o pipeline resolveu;
- provedores neurais permanecem possíveis como adapter opcional, nunca como requisito.

## Alternativas rejeitadas

- **Pedir ao modelo o arquivo de áudio final:** artefato opaco, não determinístico, sem variação por seed e sem diff.
- **Manter o `synth` do manifest como gerador:** congela um bipe como teto de qualidade e duplica síntese.
- **Implementar o sintetizador no kernel C++:** aumenta o kernel por um problema de authoring, sem medição que justifique.
- **Gerar áudio em runtime no jogo:** custo por sessão, resultado dependente do dispositivo e evidência impossível de comparar.
- **Guardar apenas o WAV no Git:** perde regeneração, variação e auditoria de licença.
- **Representar música como amostras no JSON:** documento ilegível e diff inútil.
- **Depender de serviço externo de texto-para-áudio:** dependência comercial em uma família obrigatória do ADR 0008.
