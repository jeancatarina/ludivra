# ADR 0005 — Primeira entrega web e Steam

- Status: aceito
- Data: 2026-07-18
- Revisado: 2026-07-26 para separar a primeira entrega do perfil gráfico desktop
- Estendido por: [ADR 0047](0047-desktop-rendering-profiles-and-backend-policy.md)

## Contexto

O primeiro jogo precisa de preview remoto e pacote desktop rapidamente sem acoplar gameplay ao renderer ou à loja.

## Decisão

Fixar Emscripten 6.0.3, Three.js 0.185.1, Vite 8.1.5, Electron 43.1.1 e Electron Packager 20.0.3. `runtime-web` é o único adapter da C ABI WebAssembly; `renderer-three` é o único pacote que importa Three.js; BrowserHost orquestra input, ticks e apresentação; ElectronHost hospeda o bundle endurecido e os adapters de plataforma. O empacotamento gera diretório desktop e metadados SteamPipe, mas nunca faz upload.

Esta decisão fecha a **primeira entrega**, não o teto gráfico do desktop. O ElectronHost continua sendo host de produção e pode executar os perfis `desktop-compatible` e `desktop-high` decididos pelo ADR 0047. Método gráfico, feature tier, fallback e critérios para um host nativo não são inferidos deste ADR.

## Consequências

- Browser e Electron compartilham kernel, Lua, presenter e bundle;
- compartilhar bundle não obriga web e desktop a usar o mesmo perfil gráfico;
- App ID, Depot ID, credenciais, assinatura e upload continuam externos e explícitos;
- consoles exigirão outro host e renderer;
- builds desktop atuais não são assinadas nem notarizadas.
