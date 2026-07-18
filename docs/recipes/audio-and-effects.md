# Audio and visual feedback

Use semantic IDs in gameplay and keep backend details in `game.jsonc`.

## 1. Declare audio

```jsonc
"audio": [
  {
    "id": "audio.player.hit",
    "eventId": 10,
    "bus": "effects",
    "loop": false,
    "autoplay": false,
    "volume": 0.7,
    "origin": "project-owned",
    "license": "project_owned",
    "source": "assets/audio/player-hit.ogg"
  }
]
```

Use `bus: "music"` or `"ambience"` with `loop: true` for persistent tracks. A development-only tone can replace `source` with:

```jsonc
"synth": { "waveform": "triangle", "frequency": 440, "durationMs": 120 }
```

## 2. Declare an effect

```jsonc
"effects": [
  {
    "id": "effect.player.hit",
    "eventId": 10,
    "type": "particle-burst",
    "color": 16744448,
    "count": 64,
    "size": 0.1,
    "speed": 3.0,
    "lifetimeMs": 700,
    "gravity": 1.5
  }
]
```

## 3. Emit intent from Lua

```lua
ctx.commands:play_audio(10, 1000)
ctx.commands:spawn_effect(10, 1000, x_milli, y_milli, z_milli)
```

The second argument is fixed-point intensity or volume: `1000` means 100%. Positions are also fixed-point: `1000` means one world unit. Stop a loop with `ctx.commands:stop_audio(10)`.

## 4. Cinematic rendering

`renderer-three` applies color-space correction, ACES tone mapping, directional shadows, bloom, color grading, and vignette as one reusable pipeline. Games continue to use the renderer-agnostic camera, atmosphere, surface, and particle contracts; they must not import Three.js passes or shaders.

Emissive surfaces feed bloom. Matte and metal surfaces cast shadows, while opaque non-emissive surfaces receive them. Use emissive materials only for light-bearing details such as flames, cursed eyes, spell cores, and feedback that must remain legible in fog.

## Rules

- IDs and `eventId` values must be unique within their collection.
- Audio files must remain inside the game repository and record origin and license.
- Lua never imports Three.js, Web Audio, DOM, or platform SDKs.
- BrowserHost unlocks audio only after a user gesture.
- Run `game validate --project <game>` before preview or packaging.
- Treat synth definitions as placeholders unless the intended game style explicitly uses generated tones.
