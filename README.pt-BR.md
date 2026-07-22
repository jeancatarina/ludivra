[Read in English](README.md)

# Ludivra

[![Version](https://img.shields.io/badge/version-0.7.0-7c5cff)](https://github.com/jeancatarina/ludivra)
[![Status](https://img.shields.io/badge/status-experimental-f59e0b)](BACKLOG.md)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)

Engine de jogos **AI-first, text-first e code-first** para criar jogos por chat, arquivos textuais e comandos reproduzíveis — sem depender de um editor visual proprietário.

> **Estado atual:** a fundação é utilizável para protótipos e primeiros jogos desktop. A API ainda é experimental e pode mudar antes da versão 1.0.

## O que é a Ludivra

Na Ludivra, o repositório é a fonte de verdade do jogo. Gameplay, apresentação, configuração e estado de desenvolvimento permanecem em arquivos que uma pessoa ou agente de IA pode ler, alterar, testar e versionar.

O fluxo principal é:

```text
Pedido pelo chat
      ↓
JSONC configura o jogo e os inputs
      ↓
Lua implementa gameplay determinístico
      ↓
C++20 executa simulação, saves e replays
      ↓
WebAssembly + TypeScript conectam o host
      ↓
Three.js apresenta o jogo
      ↓
Electron gera o aplicativo desktop/Steam
```

### Recursos disponíveis

- kernel C++20 determinístico com fixed ticks;
- Lua 5.4.8 em sandbox, com mutação por comandos;
- runtime nativo e WebAssembly verificados pelo mesmo hash;
- apresentação TypeScript por protocolo agnóstico;
- renderer Three.js isolado do gameplay;
- saves binários versionados e replays verificáveis;
- autosave desktop atômico, backup e checkpoint no fechamento;
- Electron com renderer sandboxed e IPC gerado por contrato;
- adapters opcionais para Steam achievements, Cloud, usuário e overlay;
- logs estruturados e Crashpad local;
- CLI com saída legível por pessoas ou agentes;
- control protocol local, cenários declarativos, replay, captura semântica e trace causal;
- conteúdo JSONC validado e ligado deterministicamente ao Lua em sandbox;
- jogo de prova card roguelite com vitória, derrota, recompensa, energia, bloqueio, save e replay;
- pacote desktop com smoke test, checksums, SBOM e provenance.

## Quem pode usar

Qualquer pessoa pode clonar, estudar, modificar e distribuir a Ludivra, inclusive em projetos comerciais, nos termos da [licença MIT](LICENSE).

No momento, a engine é consumida diretamente pelo repositório clonado. Ainda não existe uma distribuição estável em npm, Homebrew ou instalador próprio. Jogos criados com `game new` são pastas independentes, mas usam a CLI e o toolchain desta cópia da engine para executar e gerar builds.

## Maturidade e plataformas

| Área | Estado |
|---|---|
| Desenvolvimento e preview web | Experimental, funcional |
| Kernel nativo e WebAssembly | Experimental, com teste de equivalência |
| Pacote Electron para macOS | Validado localmente |
| Pacotes Windows e Linux | Geráveis, ainda exigem validação nos respectivos sistemas |
| Integração Steam | Implementada, exige App ID, Depot ID e conta Steamworks |
| Assinatura e notarização | Responsabilidade do proprietário do jogo |
| Áudio semântico, música e partículas | Experimental, funcional no Browser e Electron |
| Harness headless e sessão fria | Experimental, funcional e automatizado |
| Jogo de prova card roguelite | ENG-016 concluído; snapshot real do BrowserHost e captura raster pendentes |
| Android e iOS | Planejados |
| Consoles | Rota arquitetural futura, sem backend público |

Não trate a versão 0.7.0 como uma engine estável para produção sem avaliar essas limitações.

## Tutorial: seu primeiro jogo

### 1. Pré-requisitos

O perfil atual fixa as versões em [toolchain.lock](toolchain.lock):

- Git;
- Node.js 22.14.0;
- pnpm 11.7.0;
- CMake 4.3.0;
- Ninja 1.13.2;
- compilador com suporte a C++20;
- Bash para os scripts de bootstrap.

macOS é o ambiente atualmente validado para o pacote desktop completo. Em Windows, prefira WSL para desenvolvimento até o workflow nativo ser validado; o release Windows deve ser testado no Windows real.

### 2. Clone e prepare a engine

```sh
git clone https://github.com/jeancatarina/ludivra.git
cd ludivra
pnpm install --frozen-lockfile
pnpm build:cli
tools/deps/bootstrap-emsdk.sh
pnpm game -- doctor --format json
pnpm test
```

O bootstrap instala o Emscripten fixado dentro de `.toolchains/`; ele não altera o gameplay nem publica artefatos.

O resultado esperado do `doctor` é `"status":"passed"`. Se houver `TOOL_VERSION_MISMATCH`, ajuste a ferramenta indicada para a versão registrada no lock.

### 3. Crie o projeto do jogo

Execute a partir da raiz da Ludivra:

```sh
pnpm game -- new ../meu-primeiro-jogo --name "Meu Primeiro Jogo"
pnpm game -- status --project ../meu-primeiro-jogo --format json
pnpm game -- validate --project ../meu-primeiro-jogo --format json
```

O destino deve ser uma pasta que ainda não existe. A estrutura inicial será:

```text
meu-primeiro-jogo/
├── AGENTS.md              instruções para agentes
├── .ludivra/
│   └── project-state.json estado derivado por `game status`
├── BACKLOG.md             trabalho futuro
├── DECISIONS.md           decisões do jogo
├── SESSION_REPORT.md      evidências da última sessão
├── game.jsonc             manifesto, targets e inputs
├── scenarios/             cenários declarativos e assertions
├── scripts/
│   └── gameplay.lua       regras autoritativas
└── presentation/
    └── index.ts           apresentação visual
```

É recomendado iniciar um repositório Git próprio para o jogo:

```sh
git -C ../meu-primeiro-jogo init -b main
git -C ../meu-primeiro-jogo add .
git -C ../meu-primeiro-jogo commit -m "chore: create game from Ludivra starter"
```

### 4. Configure nome, targets e controles

Edite `../meu-primeiro-jogo/game.jsonc`:

```jsonc
{
  "schemaVersion": 2,
  "id": "meu-primeiro-jogo",
  "name": "Meu Primeiro Jogo",
  "engine": { "version": "0.7.0" },
  "targets": ["browser", "desktop", "native-headless"],
  "entrypoints": {
    "gameplay": "scripts/gameplay.lua",
    "presentation": "presentation/index.ts"
  },
  "inputs": [
    {
      "id": "confirmar",
      "label": "Confirmar",
      "actionId": 1,
      "keys": ["Space", "Enter"]
    }
  ],
  "inspection": {
    "integerStates": [
      { "id": "score", "label": "Pontuação", "key": 1 }
    ]
  },
  "scenarios": ["scenarios/confirmar.jsonc"],
  "audio": [
    {
      "id": "audio.confirm",
      "eventId": 1,
      "bus": "effects",
      "loop": false,
      "autoplay": false,
      "volume": 0.3,
      "origin": "projeto",
      "license": "project_owned",
      "source": "assets/audio/confirm.ogg"
    }
  ],
  "effects": [
    {
      "id": "effect.confirm",
      "eventId": 1,
      "type": "particle-burst",
      "color": 8150015,
      "count": 48,
      "size": 0.08,
      "speed": 2.4,
      "lifetimeMs": 500,
      "gravity": 1.0
    }
  ],
  "steam": { "appId": null, "depotId": null },
  "desktop": {
    "updates": { "enabled": false, "feedUrl": null }
  }
}
```

Gameplay recebe `actionId`, nunca teclas físicas. O binding de `Space` e `Enter` pertence ao manifesto e pode mudar sem contaminar a regra Lua.

Crie `scenarios/confirmar.jsonc` para tornar o cenário declarado imediatamente executável:

```jsonc
{
  "schemaVersion": 1,
  "id": "tutorial.confirmar",
  "requirements": ["TUTORIAL-001"],
  "seed": 42,
  "timeoutMs": 10000,
  "steps": [
    { "operation": "act", "action": "confirmar", "valueMilli": 1000 },
    {
      "operation": "wait_for",
      "condition": { "integer": { "key": 1, "equals": 1 } },
      "maxTicks": 2
    },
    { "operation": "capture", "name": "confirmado" }
  ],
  "assertions": [
    { "type": "integer-equals", "key": 1, "equals": 1 },
    { "type": "replay-verifies" }
  ]
}
```

### 5. Implemente uma regra em Lua

Edite `scripts/gameplay.lua`:

```lua
local SCORE_KEY = 1
local ACTION_CONFIRM = 1
local AUDIO_CONFIRM = 1
local EFFECT_CONFIRM = 1

return {
  on_input = function(ctx, event)
    if event.action_id == ACTION_CONFIRM and event.value_milli > 0 then
      ctx.commands:add_i64(SCORE_KEY, 1)
      ctx.commands:play_audio(AUDIO_CONFIRM, 1000)
      ctx.commands:spawn_effect(EFFECT_CONFIRM, 1000, 0, 0, 0)
    end
  end
}
```

Regras importantes:

- consulte estado com `ctx.query`;
- altere estado somente com `ctx.commands`;
- não acesse filesystem, rede, sistema operacional ou renderer;
- não use relógio civil nem RNG externo;
- mantenha IDs estáveis depois que saves públicos existirem.

IDs de áudio e efeitos são contratos semânticos. O manifesto mapeia cada um para um arquivo (ou synth simples gerado) e para uma definição de partículas. Lua apenas emite a intenção; nunca importa Web Audio ou Three.js. No navegador, o áudio começa depois do primeiro gesto do usuário por causa das políticas de autoplay.

Consulte a [receita completa de áudio e feedback visual](docs/recipes/audio-and-effects.md).

### 6. Apresente o estado em TypeScript

Edite `presentation/index.ts`. O presenter lê o estado, cria visuais semânticos e não modifica gameplay:

```ts
import type { CreateGamePresenter } from "@ludivra/presentation-protocol";

const scoreKey = 1;

export const createGamePresenter: CreateGamePresenter = (renderer) => {
  renderer.createVisual({ id: "player", shape: "sphere", color: 0x7c5cff });

  return {
    present(state) {
      const score = Number(state.integer(scoreKey));
      const scale = 1 + Math.min(score, 20) * 0.05;
      renderer.setTransform("player", {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [scale, scale, scale]
      });
    },
    destroy() {}
  };
};
```

O jogo não importa Three.js diretamente. `renderer-three` é o único adapter autorizado a conhecer essa dependência.

### 7. Execute o jogo

```sh
pnpm game -- run --project ../meu-primeiro-jogo
```

A CLI prepara o runtime WebAssembly e inicia o BrowserHost em `127.0.0.1`. Use `Ctrl+C` para encerrar.

Depois de cada alteração relevante:

```sh
pnpm game -- validate --project ../meu-primeiro-jogo --format json
pnpm game -- test --format json
pnpm game -- build --project ../meu-primeiro-jogo --target web --format json
```

### 8. Gere um aplicativo desktop

Escolha o target correspondente:

```sh
# macOS
pnpm game -- package --project ../meu-primeiro-jogo --target steam-macos --format json

# Windows
pnpm game -- package --project ../meu-primeiro-jogo --target steam-windows --format json

# Linux
pnpm game -- package --project ../meu-primeiro-jogo --target steam-linux --format json
```

O pacote é gerado em `build/steam/` e não é publicado automaticamente. Quando o target for o mesmo sistema da máquina, o empacotador executa um smoke test do Electron, preload, renderer, WebAssembly e storage.

Junto do aplicativo são produzidos:

- `SHA256SUMS`;
- `sbom.cdx.json`;
- `provenance.json`;
- scripts SteamPipe, quando os IDs estiverem configurados.

### 9. Configure a Steam

No manifesto do jogo:

```jsonc
"steam": {
  "appId": 1234560,
  "depotId": 1234561
}
```

Depois, gere novamente o pacote no sistema operacional alvo. Achievements, Steam Cloud, usuário e overlay só ficam disponíveis quando o cliente Steam, o App ID e a configuração da aplicação estiverem válidos.

Assinatura, notarização, credenciais, SteamCMD e upload são deliberadamente externos. Siga [Release desktop para Steam](docs/recipes/desktop-steam-release.md) e nunca coloque segredos no repositório.

## Desenvolvimento por chat

O jogo criado contém estado suficiente para outra sessão continuar sem depender da memória da conversa. Um pedido inicial recomendado é:

```text
Execute `game status --project . --format json`. Depois leia AGENTS.md,
.ludivra/project-state.json, game.jsonc, BACKLOG.md e as decisões relevantes.
Implemente um vertical slice pequeno. Antes de concluir, valide, teste, execute,
inspecione o resultado e atualize o relatório da sessão com evidências e limitações.
```

Para mudanças na própria engine, agentes devem começar por [AGENTS.md](AGENTS.md). As fronteiras técnicas estão em [architecture.md](architecture.md), a sequência de evolução em [ROADMAP.md](ROADMAP.md), e os gates obrigatórios em [docs/guardrails/](docs/guardrails/).

## Referência da CLI

Todos os comandos devem ser executados na raiz da engine.

| Comando | Finalidade |
|---|---|
| `game doctor` | verifica o toolchain fixado |
| `game inspect` | lista versão, plataformas e capacidades |
| `game context --task <descrição>` | localiza capabilities e contratos com fontes citáveis |
| `game new <pasta>` | cria um jogo a partir do starter |
| `game validate --project <pasta>` | valida schema e regras arquiteturais |
| `game test` | executa a suíte e grava o log em `reports/runs/` |
| `game run --project <pasta>` | inicia o preview local |
| `game run --control --project <pasta>` | executa o cenário padrão pelo control protocol |
| `game simulate --project <pasta> --scenario <arquivo>` | executa assertions e produz artifact bundle |
| `game capture --project <pasta> --scenario <arquivo>` | produz captura semântica vinculada ao estado |
| `game replay --project <pasta> --replay <arquivo>` | verifica um replay no runtime |
| `game report --project <pasta> --run <id>` | resume uma execução sem alterar o run original |
| `game status --project <pasta>` | regenera o estado canônico derivado |
| `game build --project <pasta> --target web` | gera o build web |
| `game package --project <pasta> --target <target>` | gera o pacote desktop |

Use `--format json` para obter resultados estruturados apropriados para automação e agentes.

Veja [Cenários, controle e evidência](docs/recipes/scenario-harness.md) para o formato do bundle e o fluxo de reprodução.

O primeiro jogo de prova real está em `examples/card-roguelite`. Execute todos os gates determinísticos com:

```sh
pnpm test:card-roguelite
```

## Arquitetura do repositório

```text
ludivra/
├── kernel/                  simulação C++20, saves e replays
├── runtime-c-api/           boundary C estável
├── runtime-wasm/            build Emscripten
├── runtime-web/             bridge TypeScript
├── presentation-protocol/   protocolo agnóstico
├── renderer-three/          único adapter Three.js
├── platform-contracts/      contratos dos hosts
├── hosts/
│   ├── browser/             preview e build web
│   ├── electron/            desktop e Steam
│   └── native-headless/     diagnóstico nativo
├── cli/                     comando `game`
├── contracts/               schemas e fontes geradas
├── capabilities/            catálogo legível por máquinas
├── examples/first-game/     starter jogável
└── docs/                    ADRs, guardrails e receitas
```

## Limitações conhecidas

- API e formatos permanecem experimentais até 1.0;
- o áudio usa Web Audio no Browser/Electron; adapters nativos de áudio ainda não existem;
- o feedback visual oferece bursts determinísticos de partículas; trails, decals, presets de pós-processamento e grafos de efeitos ficam para capacidades futuras;
- Windows e Linux ainda precisam de testes em runners nativos;
- pacotes não são assinados ou notarizados pela engine;
- updates exigem pacote assinado e feed HTTPS controlado;
- não há distribuição independente da CLI fora do repositório;
- Android, iOS e consoles ainda não possuem hosts utilizáveis;
- o starter demonstra a arquitetura, não um jogo comercial pronto.

O plano de evolução está em [ROADMAP.md](ROADMAP.md), e o trabalho executável do marco corrente em [BACKLOG.md](BACKLOG.md). Não esconda uma limitação com fallback silencioso.

## Como contribuir

Leia [AGENTS.md](AGENTS.md) antes de alterar a engine. Mudanças devem preservar os boundaries, incluir evidência e passar em:

```sh
pnpm game -- validate --format json
pnpm test
```

Dependências e assets distribuídos precisam de versão, origem e licença verificáveis.

## Licença

Ludivra é software livre sob a [licença MIT](LICENSE). Você pode usar a engine em jogos gratuitos ou comerciais, modificar o código e redistribuí-lo conforme os termos da licença.

Licenças e avisos das dependências distribuídas estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
