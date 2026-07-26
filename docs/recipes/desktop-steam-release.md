# Release desktop para Steam

Use esta receita somente após o jogo passar em `game validate` e `pnpm test`.

1. Defina `steam.appId` e `steam.depotId` no `game.jsonc`.
2. Declare se o jogo exige `desktop-compatible` ou `desktop-high`; feature sem fallback torna o perfil mínimo obrigatório.
3. Mantenha `desktop.updates.enabled` como `false` até existir build assinado e feed HTTPS controlado.
4. Gere no OS alvo:

```sh
pnpm game -- package --project /caminho/do/jogo --target steam-windows --format json
```

Targets válidos: `steam-windows`, `steam-macos` e `steam-linux`.

O comando deve entregar aplicativo, `SHA256SUMS`, `sbom.cdx.json`, `provenance.json` e VDFs SteamPipe. Verifique que o smoke está `passed`, a provenance aponta para commit limpo e o pacote foi testado no OS alvo.

O smoke visual precisa registrar perfil solicitado e efetivo, método gráfico, adapter/GPU, driver, resolução e motivo de fallback. Ele deve carregar o primeiro cenário, aquecer shaders, exercer input e áudio e encerrar de forma limpa. Não declare `desktop-high` se o run caiu para `desktop-compatible`.

Steam Deck usa o pacote Linux, mas é uma target de evidência separada: execute o pacote instalado no SteamOS e verifique gamepad, resolução do dispositivo, suspensão/retomada e budget térmico. Smoke em Linux desktop não substitui esse teste.

Assinatura, notarização, credenciais, SteamCMD e publicação são atos externos. Nunca coloque segredos no repositório e nunca publique sem autorização explícita do proprietário.

As fronteiras completas estão no [ADR 0047](../adr/0047-desktop-rendering-profiles-and-backend-policy.md) e no [ADR 0030](../adr/0030-target-hardening-signing-and-distribution.md).
