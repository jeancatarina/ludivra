# ADR 0024 — Multiplayer player-hosted, transportes e compatibilidade de protocolo

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de adotar qualquer transporte de rede concreto
- Depende de: [ADR 0018](0018-numeric-determinism-and-rng-streams.md), [ADR 0019](0019-spatial-model-chunk-lifecycle-and-job-commit.md) e [ADR 0021](0021-motion-and-physics-adapter-authority.md)
- Complementa: [ADR 0008](0008-mandatory-scale-and-procedural-capabilities.md)
- Fecha: item "política de compatibilidade N/N-1 por protocolo" da seção 36 de [architecture.md](../../architecture.md)
- Fase: 7

## Contexto

O compromisso do ADR 0008 é multiplayer player-hosted e host-authoritative para co-op e partidas casuais. Consoles, multiplayer competitivo, MMO e servidor dedicado permanecem fora.

Nada de rede existe hoje, o que é uma vantagem: a decisão pode ser tomada com o determinismo já resolvido pelo ADR 0018, a identidade de chunk pelo ADR 0019 e a autoridade de física pelo ADR 0021. Sem esses três, sincronização de mundo procedural seria adivinhação.

Duas escolhas duráveis precisam ficar registradas antes de qualquer implementação: o que a autoridade do host significa exatamente, e como versões diferentes do jogo se recusam ou se aceitam.

## Decisão

### Autoridade

Um jogador hospeda. O host roda o mesmo kernel autoritativo de uma sessão local; não existe caminho de simulação separado para rede.

Clientes enviam **input** e recebem snapshot, correção e eventos. Cliente nunca envia estado. Input de cliente é validado pelo host como qualquer input local, e recusa é diagnóstico, não silêncio.

Física com autoridade `host`, conforme o ADR 0021, é resolvida no host e chega ao cliente como resultado quantizado. Cliente não integra física autoritativa.

### Sincronização de mundo procedural

O mundo não é transmitido: é reproduzido. A sessão sincroniza seed, `generatorId`, `generatorVersion`, hash de conteúdo, hashes de chunk e deltas.

Divergência é detectada por comparação de hash e localizada por cenário até o primeiro tick, evento ou chunk divergente — `NETWORK_WORLD_HASH_MISMATCH`. Backlog de deltas de chunk acima do limite declarado é `NETWORK_CHUNK_DELTA_BACKLOG`, não crescimento indefinido de fila.

### Transporte por adapter

O protocolo é lógico e independente de transporte. O primeiro transporte é **local**, em processo ou loopback, porque é ele que roda em CI e em cenário reproduzível.

WebRTC, Steam Networking, P2P de plataforma e UDP direto são adapters, cada um exigindo ADR próprio por serem dependência de runtime com implicações de licença, plataforma e privacidade. Relay é fallback de transporte e nunca servidor de gameplay: relay que interprete estado é violação de arquitetura, não otimização.

### Compatibilidade N/N-1

O protocolo declara `protocolVersion`. Um host aceita clientes na versão N e na versão N-1. N-2 e anteriores são recusados no handshake com `NETWORK_PROTOCOL_VERSION_UNSUPPORTED` e mensagem que nomeia a versão exigida.

A janela de compatibilidade só é válida com fixture que prove interoperação real entre N e N-1; janela alegada sem fixture não existe. Negociação ocorre apenas no handshake. Detecção de recurso por tentativa é proibida, conforme as regras de engenharia.

Mudança incompatível incrementa a versão; mudança aditiva compatível não a incrementa e precisa ser tolerada pelo par mais antigo por construção.

### Sessão

Late join, reconexão e host migration são exigências do gate. Migração transfere autoridade com estado verificado por hash; migração que não consiga reconstituir o estado falha explicitamente com `HOST_MIGRATION_FAILED` em vez de continuar com autoridade duvidosa.

Snapshots de sala, jogadores, latência, perda, correções, interesse e migração são inspecionáveis.

### Limites declarados

Co-op, partidas casuais e sandboxes entre amigos. Sem anti-cheat, sem matchmaking, sem servidor dedicado, sem competitivo e sem garantia de determinismo cross-platform de física.

Códigos: `NETWORK_WORLD_HASH_MISMATCH`, `NETWORK_CHUNK_DELTA_BACKLOG`, `NETWORK_PROTOCOL_VERSION_UNSUPPORTED`, `NETWORK_CLIENT_SENT_STATE`, `ROOM_PHYSICS_DIVERGENCE`, `HOST_MIGRATION_FAILED`.

## Consequências

- não existe segunda implementação da simulação para o caso em rede;
- mundo procedural sincroniza por seed e deltas, sem transmitir terreno;
- o transporte local torna multiplayer testável em CI antes de qualquer dependência de rede;
- cada transporte real passa a exigir ADR com licença e avaliação de plataforma;
- a janela de compatibilidade fica objetiva e exige fixture, não intenção;
- host migration pode falhar de forma limpa, o que é preferível a autoridade ambígua;
- os limites do compromisso ficam explícitos e impedem alegação de competitivo.

## Alternativas rejeitadas

- **Servidor dedicado autoritativo:** fora do compromisso do ADR 0008 e exigiria operação e custo contínuos.
- **Lockstep determinístico para tudo:** depende de determinismo cross-platform de física, que o ADR 0021 recusa prometer.
- **Cliente autoritativo ou envio de estado pelo cliente:** transforma qualquer cliente modificado em fonte de verdade.
- **Transmitir o mundo gerado:** desperdiça banda para reenviar o que a seed reproduz.
- **Relay que interpreta gameplay:** vira servidor de gameplay sem os compromissos de um, e cria dependência operacional.
- **Detecção de recurso por tentativa:** proibida pelas regras de engenharia e produz falha tardia e ambígua.
- **Janela de compatibilidade ampla:** manter N-3 exigiria conservar caminhos de migração sem fixture que os cubra.
