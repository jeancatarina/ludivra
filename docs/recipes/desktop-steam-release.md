# Release desktop para Steam

Use esta receita somente após o jogo passar em `game validate` e `pnpm test`.

1. Defina `steam.appId` e `steam.depotId` no `game.jsonc`.
2. Mantenha `desktop.updates.enabled` como `false` até existir build assinado e feed HTTPS controlado.
3. Gere no OS alvo:

```sh
pnpm game -- package --project /caminho/do/jogo --target steam-windows --format json
```

Targets válidos: `steam-windows`, `steam-macos` e `steam-linux`.

O comando deve entregar aplicativo, `SHA256SUMS`, `sbom.cdx.json`, `provenance.json` e VDFs SteamPipe. Verifique que o smoke está `passed`, a provenance aponta para commit limpo e o pacote foi testado no OS alvo.

Assinatura, notarização, credenciais, SteamCMD e publicação são atos externos. Nunca coloque segredos no repositório e nunca publique sem autorização explícita do proprietário.
