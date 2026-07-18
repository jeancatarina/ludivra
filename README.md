# Ludivra

Fundação da engine AI-first, text-first e code-first descrita em [architecture.md](architecture.md).

## Pronto para o primeiro jogo

- kernel C++20 determinístico com Lua 5.4.8 em sandbox e mutação por comandos;
- mesma simulação em build nativa e WebAssembly, verificada por hash;
- protocolo de apresentação agnóstico e adapter Three.js isolado;
- preview no BrowserHost e pacote desktop no ElectronHost;
- criação, validação, execução, build web e empacotamento Steam pela CLI;
- starter jogável em `examples/first-game`.

## Bootstrap

```sh
pnpm install
tools/deps/bootstrap-emsdk.sh
pnpm test
pnpm game -- doctor --format json
```

Crie e execute um jogo sem IDE:

```sh
pnpm game -- new ../my-steam-game --name "My Steam Game"
pnpm game -- validate --project ../my-steam-game --format json
pnpm game -- run --project ../my-steam-game
```

Gere os artefatos:

```sh
pnpm game -- build --project ../my-steam-game --target web --format json
pnpm game -- package --project ../my-steam-game --target steam-macos --format json
```

Targets desktop aceitos: `steam-macos`, `steam-windows` e `steam-linux`. O pacote local não publica nada. Para gerar scripts SteamPipe, preencha `steam.appId` e `steam.depotId` em `game.jsonc`; upload exige conta autorizada e o SDK Steamworks.

## Limites atuais

- pacotes desktop ainda não são assinados ou notarizados;
- saves, replays, áudio e integração Steamworks em runtime ainda não estão implementados;
- empacotamento cruzado existe, mas cada target precisa ser testado no sistema operacional real antes de release;
- o starter prova a arquitetura e deve ser substituído pelo vertical slice do jogo.

Consulte [AGENTS.md](AGENTS.md) antes de contribuir. Limitações e próximos marcos estão em [BACKLOG.md](BACKLOG.md).

## Licença

Ludivra é distribuída sob a [licença MIT](LICENSE).
Dependências distribuídas estão registradas em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
