# ADR 0005 — Primeira entrega web e Steam

- Status: aceito
- Data: 2026-07-18

## Contexto

O primeiro jogo precisa de preview remoto e pacote desktop rapidamente sem acoplar gameplay ao renderer ou à loja.

## Decisão

Fixar Emscripten 6.0.3, Three.js 0.185.1, Vite 8.1.5, Electron 43.1.1 e Electron Packager 20.0.3. `runtime-web` é o único adapter da C ABI WebAssembly; `renderer-three` é o único pacote que importa Three.js; BrowserHost orquestra input, ticks e apresentação; ElectronHost apenas hospeda o bundle web endurecido. O empacotamento gera diretório desktop e metadados SteamPipe, mas nunca faz upload.

## Consequências

- Browser e Electron compartilham kernel, Lua, presenter e bundle;
- App ID, Depot ID, credenciais, assinatura e upload continuam externos e explícitos;
- consoles exigirão outro host e renderer;
- builds desktop atuais não são assinadas nem notarizadas.
