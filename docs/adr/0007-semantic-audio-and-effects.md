# ADR 0007 — Áudio e efeitos semânticos

- Status: aceito
- Data: 2026-07-18
- Revisão: antes de estabilizar o protocolo de apresentação
- Estendido por: [ADR 0025](0025-audio-backends-voice-budgets-and-fallback.md) para backend por host, budgets de voz e fallback

## Contexto

A arquitetura exige feedback audiovisual, mas o runtime implementado expunha apenas estado inteiro retido e formas básicas. Gameplay não pode importar Web Audio, Three.js ou detalhes de assets.

## Decisão

Lua emitirá comandos numéricos `play_audio`, `stop_audio` e `spawn_effect`. O kernel os validará e produzirá um lote ordenado de eventos transitórios com sequência monotônica. A C ABI transportará registros contíguos gerados por `presentation-events.schema.json`; o bridge TypeScript drenará o lote uma vez por frame.

O manifesto mapeará IDs numéricos para definições semânticas. `BrowserHost` implementará áudio por Web Audio e arquivos empacotados pelo Vite. Música persistente usará definições com loop e autoplay após desbloqueio por gesto. `renderer-three` implementará inicialmente partículas em burst com budget explícito. Novos backends poderão consumir o mesmo evento sem alterar gameplay.

## Consequências

- eventos audiovisuais são reproduzíveis e entram no hash determinístico;
- saves não armazenam vozes, partículas ou objetos de renderer;
- arquivos de áudio são assets do jogo e precisam de origem/licença declaradas antes de release;
- o primeiro backend cobre música, one-shots, síntese e partículas, não um editor visual ou sistema universal de VFX;
- eventos não drenados têm limite fixo e falham explicitamente em vez de crescer sem controle.
