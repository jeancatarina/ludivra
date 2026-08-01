# ADR 0038 — Transportes de rede aprovados

- Status: provisório
- Data: 2026-07-24
- Revisão: antes de adicionar um quarto transporte, ou se um relay passar a ser exigido por padrão
- Fecha a pendência de: [ADR 0024](0024-player-hosted-multiplayer-and-protocol-compatibility.md)
- Fase: 7

## Contexto

O ADR 0024 decidiu multiplayer host-authoritative, protocolo lógico independente de transporte, transporte local primeiro e compatibilidade N/N-1. Ele deixou cada transporte concreto para um ADR próprio, e essa pendência bloqueia qualquer sessão entre máquinas.

Duas restrições delimitam a escolha. O jogo roda em navegador e em Electron, portanto UDP cru não está disponível no cliente principal. E o compromisso é co-op e partidas casuais entre amigos, não matchmaking, o que remove a necessidade de infraestrutura própria.

## Decisão

### Três transportes, nesta ordem

**1. Loopback local.** Em processo ou por par de streams locais. É o único obrigatório, roda em CI e já prova handshake N/N-1, autoridade do host, late join, reconexão, snapshot, migração verificada e recusa de estado vindo de cliente. Localização de divergência continua gate próprio antes de um adapter externo.

**2. WebRTC DataChannel.** Disponível nativamente em navegador e em Electron, sem dependência nova no repositório. O boundary `WebRtcDataChannelTransport` publica envelope binário v1, mantendo canal confiável para handshake, snapshots, migração e correções e canal de tempo real para input — sem fallback silencioso entre eles. Offer/answer possuem serialização copiável validada. `HostedRoomBridge` recebe esses envelopes, conecta o handshake à `LudivraNetworkRoom` compilada no WASM, entrega somente input lógico ao host e devolve snapshots canônicos pelo canal confiável.

A sinalização é responsabilidade do jogador, não da engine: a primeira implementação troca oferta e resposta por **texto copiável** — o mesmo código que o jogador manda para o amigo por qualquer canal. Isso mantém a promessa de player-hosted sem que a Ludivra opere servidor. Servidor de sinalização é adapter opcional futuro, nunca requisito.

**3. Steam Networking.** Por `steamworks.js`, que já é dependência opcional do ElectronHost pelo ADR 0006. O host publica accept/send/read P2P com peer id decimal, pacotes realtime limitados a 1200 bytes e pacotes confiáveis limitados a 1 MiB; BrowserHost adapta o mesmo envelope binário usado em WebRTC. O jogo passa cada leitura válida ao mesmo `HostedRoomBridge`, sem segunda simulação ou protocolo Steam específico. Disponível apenas no host desktop com Steam presente, App ID válido e API P2P carregada, sempre com status explícito quando ausente.

### Relay

Relay é fallback de transporte, nunca servidor de gameplay. Um relay que interprete estado é violação de arquitetura. Nenhum relay é operado pela Ludivra; usar um relay é decisão do jogo, declarada e com endpoint próprio.

### Regras comuns

Todo transporte implementa o mesmo contrato lógico e não conhece regra de jogo. Nenhum transporte pode reordenar, deduplicar ou reinterpretar mensagens de forma que o protocolo não declare. Indisponibilidade é status explícito com código, nunca degradação silenciosa para outro transporte.

`HostedRoomBridge` é o ponto de lifecycle publicado pelo host: associa uma identidade opaca de peer ao client id da sala, exige handshake antes de input, trata novo handshake do mesmo peer como reconexão com snapshot fresco e rejeita snapshot ou migration enviado por cliente. `correction` no sentido cliente→host é estritamente um relatório imutável de hashes, nunca estado. O jogo chama `advance()` uma vez por tick determinístico; o bridge não abre sockets, não escolhe transporte e não opera matchmaking.

Quando há predição local, `RemoteRoomClientBridge` conserva uma janela limitada de `{tick, stateHash}`. Ao receber snapshot do host no mesmo tick com hash diferente, ele reporta a janela confiavelmente; `HostedRoomBridge` confronta essa janela com seus snapshots canônicos, emite o diagnóstico `NETWORK_WORLD_HASH_MISMATCH` para o primeiro tick incompatível e reenvia o archive `LDSV` atual. O cliente verifica tick/hash após `loadSave`; estado local nunca é promovido. Hashes e deltas por **chunk** continuam uma extensão do boundary de mundo, não uma interpretação feita pelo transporte.

`HostedChunkSync` e `RemoteChunkSync` implementam essa extensão sem transmitir base procedural. O Runtime expõe somente overlays de chunk já confirmados no tick; o host os coloca numa fila confiável limitada por peer, e o cliente aplica apenas payload com fingerprint válido antes de confirmar o hash. Ack incompatível torna-se `NETWORK_WORLD_HASH_MISMATCH`; fila além do orçamento é `NETWORK_CHUNK_DELTA_BACKLOG`. A escolha de interesse espacial continua do jogo, nunca uma decisão implícita do adapter.

Privacidade: WebRTC expõe endereços dos pares ao par conectado, e isso é declarado ao jogador antes da conexão. Steam Networking encaminha pela rede da plataforma conforme os termos dela.

Códigos: `NETWORK_TRANSPORT_UNAVAILABLE`, `NETWORK_TRANSPORT_NOT_DECLARED`, `NETWORK_SIGNALING_INVALID`, `NETWORK_PEER_ADDRESS_DISCLOSURE_UNACKNOWLEDGED`, `NETWORK_RELAY_INTERPRETED_STATE`.

## Consequências

- multiplayer passa a ser implementável sem dependência nova de rede;
- CI prova a sessão inteira pelo loopback, sem rede e sem intermitência;
- sinalização por texto mantém a engine fora da operação de servidores;
- Steam permanece opcional e com status explícito, coerente com o ADR 0006;
- a exposição de endereço pelo WebRTC passa a ser informada, não implícita;
- um quarto transporte exige revisão deste ADR.

## Alternativas rejeitadas

- **UDP cru como transporte principal:** indisponível no navegador, que é o cliente principal.
- **Servidor de sinalização próprio desde o início:** cria operação, custo e ponto único de falha para um compromisso de partidas entre amigos.
- **SDK de netcode de terceiros:** dependência grande com modelo de autoridade próprio, conflitando com o kernel autoritativo do ADR 0024.
- **Relay obrigatório:** transformaria conexão casual em serviço operado.
- **Fallback automático entre transportes:** esconde a causa real da falha de conexão.
