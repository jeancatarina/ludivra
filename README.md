[Leia em Português](README.pt-BR.md)

# Ludivra

[![Version](https://img.shields.io/badge/version-0.4.0-7c5cff)](https://github.com/jeancatarina/ludivra)
[![Status](https://img.shields.io/badge/status-experimental-f59e0b)](BACKLOG.md)
[![License](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)

An **AI-first, text-first, and code-first** game engine for creating games through chat, text files, and reproducible commands—without depending on a proprietary visual editor.

> **Current status:** the foundation is ready for prototypes and early desktop games. The API is experimental and may change before version 1.0.

## What is Ludivra?

In Ludivra, the repository is the source of truth for the game. Gameplay, presentation, configuration, and development state live in files that a person or AI agent can read, modify, test, and version.

The main workflow is:

```text
Request through chat
      ↓
JSONC configures the game and input bindings
      ↓
Lua implements deterministic gameplay
      ↓
C++20 runs simulation, saves, and replays
      ↓
WebAssembly + TypeScript connect the host
      ↓
Three.js presents the game
      ↓
Electron packages the desktop/Steam application
```

### Available features

- deterministic C++20 kernel with fixed ticks;
- sandboxed Lua 5.4.8 with command-based state mutation;
- native and WebAssembly runtimes verified with the same state hash;
- TypeScript presentation through a renderer-agnostic protocol;
- Three.js renderer isolated from gameplay, with shadows, cinematic tone mapping, bloom, color grading, vignette, fog, and particles;
- versioned binary saves and verifiable replays;
- atomic desktop autosave, backup, and close-time checkpointing;
- Electron with a sandboxed renderer and contract-generated IPC;
- optional adapters for Steam achievements, Cloud, user, and overlay;
- structured logs and local Crashpad reporting;
- CLI output designed for both people and AI agents;
- desktop packages with smoke tests, checksums, SBOM, and provenance.

## Who can use it?

Anyone can clone, study, modify, and distribute Ludivra, including in commercial projects, under the terms of the [MIT License](LICENSE).

For now, the engine is consumed directly from a cloned repository. There is no stable npm package, Homebrew formula, or standalone installer yet. Projects created with `game new` are independent directories, but they use the CLI and toolchain from this engine checkout to run and produce builds.

## Maturity and platform support

| Area | Status |
|---|---|
| Web development and preview | Experimental, functional |
| Native and WebAssembly kernel | Experimental, with equivalence tests |
| Electron package for macOS | Validated locally |
| Windows and Linux packages | Can be generated; still require validation on their target systems |
| Steam integration | Implemented; requires an App ID, Depot ID, and Steamworks account |
| Signing and notarization | Responsibility of the game owner |
| Semantic audio, music, and particle effects | Experimental, functional in Browser and Electron |
| Android and iOS | Planned |
| Consoles | Future architectural path; no public backend |

Do not treat version 0.4.0 as a production-stable engine without evaluating these limitations.

## Tutorial: create your first game

### 1. Prerequisites

The current development profile pins the versions in [toolchain.lock](toolchain.lock):

- Git;
- Node.js 22.14.0;
- pnpm 11.7.0;
- CMake 4.3.0;
- Ninja 1.13.2;
- a compiler with C++20 support;
- Bash for the bootstrap scripts.

macOS is currently the validated environment for the complete desktop packaging flow. On Windows, prefer WSL for development until the native workflow is validated; Windows releases must still be tested on a real Windows system.

### 2. Clone and prepare the engine

```sh
git clone https://github.com/jeancatarina/ludivra.git
cd ludivra
pnpm install --frozen-lockfile
pnpm build:cli
tools/deps/bootstrap-emsdk.sh
pnpm game -- doctor --format json
pnpm test
```

The bootstrap installs the pinned Emscripten version inside `.toolchains/`. It does not modify gameplay or publish any artifact.

The expected `doctor` result is `"status":"passed"`. If it reports `TOOL_VERSION_MISMATCH`, install the version recorded in the toolchain lock for the affected tool.

### 3. Create a game project

Run this from the Ludivra root directory:

```sh
pnpm game -- new ../my-first-game --name "My First Game"
pnpm game -- validate --project ../my-first-game --format json
```

The destination must be a directory that does not already exist. The starter creates:

```text
my-first-game/
├── AGENTS.md              instructions for AI agents
├── PROJECT_STATE.json     durable state between sessions
├── BACKLOG.md             future work
├── DECISIONS.md           game-specific decisions
├── SESSION_REPORT.md      evidence from the latest session
├── game.jsonc             manifest, targets, and input bindings
├── scripts/
│   └── gameplay.lua       authoritative rules
└── presentation/
    └── index.ts           visual presentation
```

Create a separate Git repository for the game:

```sh
git -C ../my-first-game init -b main
git -C ../my-first-game add .
git -C ../my-first-game commit -m "chore: create game from Ludivra starter"
```

### 4. Configure the game, targets, and controls

Edit `../my-first-game/game.jsonc`:

```jsonc
{
  "schemaVersion": 1,
  "id": "my-first-game",
  "name": "My First Game",
  "engine": { "version": "0.4.0" },
  "targets": ["browser", "desktop", "native-headless"],
  "entrypoints": {
    "gameplay": "scripts/gameplay.lua",
    "presentation": "presentation/index.ts"
  },
  "inputs": [
    {
      "id": "confirm",
      "label": "Confirm",
      "actionId": 1,
      "keys": ["Space", "Enter"]
    }
  ],
  "audio": [
    {
      "id": "audio.confirm",
      "eventId": 1,
      "bus": "effects",
      "loop": false,
      "autoplay": false,
      "volume": 0.3,
      "origin": "project-owned",
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

Gameplay receives an `actionId`, never a physical key. The `Space` and `Enter` bindings belong to the manifest and can change without coupling device details to the Lua rule.

### 5. Implement a gameplay rule in Lua

Edit `scripts/gameplay.lua`:

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

Important rules:

- read state through `ctx.query`;
- change state only through `ctx.commands`;
- do not access the filesystem, network, operating system, or renderer;
- do not use wall-clock time or external random-number generators;
- keep IDs stable after public saves exist.

Audio and effect IDs are semantic contracts. The game manifest maps them to an audio file (or a simple generated synth) and a particle definition. Lua only emits intent; it never imports Web Audio or Three.js. Browsers start audio after the first user gesture, as required by autoplay policies.

See the complete [audio and visual feedback recipe](docs/recipes/audio-and-effects.md).

### 6. Present the state in TypeScript

Edit `presentation/index.ts`. A presenter reads logical state, creates semantic visuals, and never changes gameplay:

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

Game code does not import Three.js directly. `renderer-three` is the only adapter allowed to depend on it.

### 7. Run the game

```sh
pnpm game -- run --project ../my-first-game
```

The CLI prepares the WebAssembly runtime and starts BrowserHost on `127.0.0.1`. Press `Ctrl+C` to stop it.

After every relevant change:

```sh
pnpm game -- validate --project ../my-first-game --format json
pnpm game -- test --format json
pnpm game -- build --project ../my-first-game --target web --format json
```

### 8. Build a desktop application

Choose the matching target:

```sh
# macOS
pnpm game -- package --project ../my-first-game --target steam-macos --format json

# Windows
pnpm game -- package --project ../my-first-game --target steam-windows --format json

# Linux
pnpm game -- package --project ../my-first-game --target steam-linux --format json
```

The package is written to `build/steam/` and is never published automatically. When the target matches the host operating system, the packager runs a smoke test covering Electron, preload, renderer, WebAssembly, and storage.

Each package also produces:

- `SHA256SUMS`;
- `sbom.cdx.json`;
- `provenance.json`;
- SteamPipe scripts when Steam IDs are configured.

### 9. Configure Steam

Set the IDs in the game manifest:

```jsonc
"steam": {
  "appId": 1234560,
  "depotId": 1234561
}
```

Then generate the package again on the target operating system. Achievements, Steam Cloud, user data, and the overlay are available only when the Steam client, App ID, and application configuration are valid.

Signing, notarization, credentials, SteamCMD, and uploads are deliberately external. Follow the [Desktop Steam release guide](docs/recipes/desktop-steam-release.md), and never store secrets in the repository.

## Chat-driven development

A generated game contains enough durable state for a new session to continue without depending on conversation memory. A useful initial request is:

```text
Read AGENTS.md, PROJECT_STATE.json, game.jsonc, BACKLOG.md, and the relevant decisions.
Implement a small vertical slice. Before finishing, validate, test, run, and inspect it.
Update the session report with evidence, limitations, and one recommended next step.
```

Agents modifying the engine itself must start with [AGENTS.md](AGENTS.md). Technical boundaries are defined in [architecture.md](architecture.md), the evolution sequence lives in [ROADMAP.md](ROADMAP.md), and mandatory gates live in [docs/guardrails/](docs/guardrails/).

## CLI reference

Run all commands from the engine root directory.

| Command | Purpose |
|---|---|
| `game doctor` | checks the pinned toolchain |
| `game inspect` | lists the engine version, platforms, and capabilities |
| `game new <directory>` | creates a game from the starter |
| `game validate --project <directory>` | validates schemas and architectural rules |
| `game test` | runs the test suite and writes a log to `reports/runs/` |
| `game run --project <directory>` | starts the local preview |
| `game build --project <directory> --target web` | creates the web build |
| `game package --project <directory> --target <target>` | creates a desktop package |

Use `--format json` for structured output designed for automation and AI agents.

## Repository architecture

```text
ludivra/
├── kernel/                  C++20 simulation, saves, and replays
├── runtime-c-api/           stable C boundary
├── runtime-wasm/            Emscripten build
├── runtime-web/             TypeScript bridge
├── presentation-protocol/   renderer-agnostic protocol
├── renderer-three/          sole Three.js adapter
├── platform-contracts/      host contracts
├── hosts/
│   ├── browser/             preview and web build
│   ├── electron/            desktop and Steam
│   └── native-headless/     native diagnostics
├── cli/                     `game` command
├── contracts/               schemas and generation sources
├── capabilities/            machine-readable catalog
├── examples/first-game/     playable starter
└── docs/                    ADRs, guardrails, and recipes
```

## Known limitations

- APIs and formats remain experimental until 1.0;
- audio currently uses Web Audio in Browser/Electron; native audio adapters are not implemented;
- visual feedback provides deterministic particle bursts and a built-in cinematic post-processing pipeline; configurable presets, trails, decals, and custom effect graphs remain future capabilities;
- Windows and Linux still require tests on native runners;
- the engine does not sign or notarize packages;
- updates require a signed package and a controlled HTTPS feed;
- the CLI is not distributed independently from the repository;
- Android, iOS, and consoles do not have usable hosts yet;
- the starter demonstrates the architecture; it is not a production-ready commercial game.

The evolution plan lives in [ROADMAP.md](ROADMAP.md), and executable work for the current milestone is tracked in [BACKLOG.md](BACKLOG.md). Never hide a limitation behind a silent fallback.

## Contributing

Read [AGENTS.md](AGENTS.md) before changing the engine. Changes must preserve architectural boundaries, include evidence, and pass:

```sh
pnpm game -- validate --format json
pnpm test
```

Distributed dependencies and assets must have verifiable versions, origins, and licenses.

## License

Ludivra is open-source software under the [MIT License](LICENSE). You may use the engine in free or commercial games, modify it, and redistribute it under the license terms.

Third-party dependency licenses and notices are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
