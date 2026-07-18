# ADR 0006 — Host desktop comercial e Steam opcional

- Status: aceito
- Data: 2026-07-18
- Revisão: antes do primeiro release assinado

## Contexto

O pacote Electron existente abre o jogo, mas não implementa os serviços e evidências exigidos pela Fase 3: storage atômico, lifecycle, diagnóstico de crash, Steam, atualização e release auditável.

## Decisão

`platform-contracts` será a fonte gerada dos contratos IPC. O ElectronHost manterá `contextIsolation`, sandbox do renderer e preload mínimo; filesystem, crash reporting e SDKs nativos existirão somente no processo principal. Saves locais usarão escrita atômica com backup. Crashpad coletará dumps localmente por padrão, sem upload implícito. Steamworks.js 0.4.0 será o binding opcional no adapter Steam do processo principal; indisponibilidade de Steam, App ID ou cliente será um status explícito. Steam Auto-Cloud poderá sincronizar a pasta de saves configurada no Steamworks, enquanto o adapter de Remote Storage permanecerá disponível para jogos que o declararem. Updates serão desabilitados por padrão e só consultarão feed HTTPS declarado em build assinado.

O pacote produzirá SBOM CycloneDX mínimo derivado dos locks, provenance, hashes e smoke test local. Assinatura, notarização e upload permanecem comandos externos que exigem credenciais e autorização.

## Consequências

- renderer e gameplay nunca recebem Node.js ou objetos Steam;
- o preload expõe somente operações tipadas e canais gerados;
- testes usam adapters falsos apenas no boundary Steam/Electron;
- pacote sem Steam continua jogável com storage local e diagnósticos;
- conquistas e cloud não podem reportar sucesso quando Steam estiver indisponível;
- releases comerciais continuam bloqueados sem IDs, credenciais e teste no OS alvo.

## Alternativas rejeitadas

- habilitar `nodeIntegration` no renderer: amplia desnecessariamente a superfície de ataque;
- chamar Steamworks diretamente na apresentação: viola o host boundary;
- esconder ausência de Steam com sucesso local: quebra reconciliação e observabilidade;
- enviar crashes a serviço externo por padrão: exige consentimento, endpoint e política de privacidade ainda inexistentes.
