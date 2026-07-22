# Última sessão

Starter atualizado para Ludivra 0.7.0. O projeto declara estado inspecionável e o cenário `starter.charge-core`, controlável pelo harness local.

O cenário envia a ação `charge`, espera a carga do núcleo chegar a 1, captura o layout semântico, grava timeline causal e verifica o replay. Use `game simulate --project . --scenario scenarios/charge-core.jsonc --format json` e regenere o estado com `game status` para localizar a evidência compatível mais recente.

A captura atual é SVG do renderer semântico headless. O loop do card roguelite está em `examples/card-roguelite`; pixels e snapshots reais do BrowserHost permanecem na próxima etapa.
