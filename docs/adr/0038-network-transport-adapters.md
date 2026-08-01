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

**2. WebRTC DataChannel.** Disponível nativamente em navegador e em Electron, sem dependência nova no repositório. Canal não confiável e não ordenado para snapshot, canal confiável e ordenado para handshake, deltas de chunk e correções.

A sinalização é responsabilidade do jogador, não da engine: a primeira implementação troca oferta e resposta por **texto copiável** — o mesmo código que o jogador manda para o amigo por qualquer canal. Isso mantém a promessa de player-hosted sem que a Ludivra opere servidor. Servidor de sinalização é adapter opcional futuro, nunca requisito.

**3. Steam Networking.** Por `steamworks.js`, que já é dependência opcional do ElectronHost pelo ADR 0006. Disponível apenas no host desktop com Steam presente, e sempre com status explícito quando ausente.

### Relay

Relay é fallback de transporte, nunca servidor de gameplay. Um relay que interprete estado é violação de arquitetura. Nenhum relay é operado pela Ludivra; usar um relay é decisão do jogo, declarada e com endpoint próprio.

### Regras comuns

Todo transporte implementa o mesmo contrato lógico e não conhece regra de jogo. Nenhum transporte pode reordenar, deduplicar ou reinterpretar mensagens de forma que o protocolo não declare. Indisponibilidade é status explícito com código, nunca degradação silenciosa para outro transporte.

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
