# ADR 0030 — Hardening de targets, assinatura e distribuição verificável

- Status: provisório
- Data: 2026-07-24
- Revisão: antes do primeiro release assinado de cada plataforma
- Complementa: [ADR 0005](0005-first-steam-delivery.md) e [ADR 0006](0006-desktop-commercial-host.md)
- Fecha: item "estratégia de assinatura e distribuição por plataforma" da seção 36 de [architecture.md](../../architecture.md)
- Backlog: `ENG-009` e `ENG-013`
- Fase: 11

## Contexto

O ADR 0006 já decidiu a parte que não depende de credencial: SBOM CycloneDX derivado dos locks, provenance, hashes e smoke test local, com assinatura, notarização e upload permanecendo comandos externos que exigem credenciais e autorização. O ADR 0005 registrou que os builds desktop atuais não são assinados nem notarizados.

O que continua aberto é a estratégia por plataforma, e ela bloqueia dois itens de backlog reais: `ENG-009`, validar pacotes Windows e Linux em runners nativos, e `ENG-013`, assinar e notarizar macOS após autorização e credenciais explícitas.

Há uma regra da casa que precisa se aplicar aqui sem exceção: alegar suporte a um target exige execução no sistema correspondente. Empacotar em uma máquina e declarar suporte em outra é a falha que este ADR precisa impedir.

## Decisão

### Assinatura por plataforma

| Plataforma | Modelo | Situação |
|---|---|---|
| macOS | Developer ID, notarização e stapling | exige credencial do usuário |
| Windows | Authenticode com certificado do usuário | exige credencial do usuário |
| Linux | sem assinatura de SO; assinatura destacada e checksums publicados | possível sem credencial |
| Browser | sem assinatura; integridade por HTTPS e hashes publicados | possível sem credencial |
| Android e iOS | assinatura da plataforma pelas ferramentas oficiais | fora do escopo até o target existir |

Credencial nunca entra no repositório, em log, em artefato de run ou em variável comitada. Ela é consumida do ambiente ou do keychain do sistema, no momento da operação, por comando explicitamente autorizado.

Assinatura em CI é proibida por padrão. Ela exige autorização explícita, segredo gerenciado fora do repositório e registro de quem autorizou.

### Build não assinado é declarado

Um pacote sem assinatura declara isso no seu manifest e no relatório. Distribuir build não assinado é permitido para teste interno e proibido apresentar como release. Ausência de assinatura nunca é omissão.

### Evidência de release

Um release auditável carrega: SBOM, provenance, hashes de todos os artefatos, relatório de verificação de assinatura quando assinado, e **smoke test executado a partir do pacote instalado no sistema alvo** — não a partir da árvore de build.

O smoke instalado é o que fecha `ENG-009`: um pacote Windows só é validado por execução em Windows, e o mesmo vale para Linux e macOS. Sem isso, o item da target matrix permanece `NOT_AVAILABLE`.

### Hardening por target

Browser e Electron mantêm as decisões do ADR 0006 — `contextIsolation`, sandbox do renderer, preload mínimo, ausência de Node no renderer. O hardening adiciona, por target: superfície de rede declarada, permissões solicitadas justificadas, ausência de endpoint de telemetria implícito e caminho de crash dump local sem upload por padrão.

Atualização automática permanece desabilitada por padrão e só consulta feed HTTPS declarado em build assinado, conforme o ADR 0006.

### Publicação

Upload para loja, feed ou serviço permanece operação externa, explícita e autorizada caso a caso. Nenhuma automação de release publica sem autorização registrada — nem em CI, nem em cron, nem por conveniência.

Códigos: `RELEASE_SIGNATURE_MISSING`, `RELEASE_SIGNATURE_INVALID`, `RELEASE_CREDENTIAL_UNAVAILABLE`, `RELEASE_SMOKE_NOT_RUN_ON_TARGET`, `RELEASE_SBOM_INCOMPLETE`, `RELEASE_PUBLISH_NOT_AUTHORIZED`, `RELEASE_TARGET_UNVERIFIED`.

## Consequências

- `ENG-009` e `ENG-013` ganham critério objetivo de conclusão;
- alegação de suporte a target passa a exigir smoke a partir do pacote instalado naquele sistema;
- build não assinado continua utilizável para teste e nunca é apresentado como release;
- credenciais permanecem fora do repositório e fora do CI por padrão;
- Linux e browser podem ter release verificável sem credencial de assinatura;
- Android e iOS permanecem explicitamente fora até o target existir;
- publicação continua sendo decisão humana registrada.

## Alternativas rejeitadas

- **Assinar em CI por padrão:** coloca credencial de assinatura em ambiente compartilhado sem autorização por operação.
- **Declarar suporte a target empacotado em outra plataforma:** é a alegação sem evidência que a target matrix existe para impedir.
- **Smoke a partir da árvore de build:** não exercita instalação, permissões nem caminhos do pacote.
- **Distribuir build não assinado como release:** transfere ao jogador o aviso do sistema operacional e mascara a lacuna.
- **Guardar credencial em arquivo do repositório:** é rejeição automática pelos guardrails, sem exceção possível.
- **Atualização automática habilitada por padrão:** canal de execução remota em build que pode não estar assinado.
- **Automatizar upload junto do build:** publicação deixaria de ser decisão explícita.
