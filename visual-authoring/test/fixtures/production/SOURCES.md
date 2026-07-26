# Visual Forge production fixture sources

The 2D cutout and 2.5D directional sheet were generated with the built-in
OpenAI image-generation mode on 2026-07-25. Their accepted source bytes,
prompts, origin, terms note and SHA-256 values are recorded by
`visuals/goblin-shaman-production.character.json`.

The 3D wizard fixture is `Wizard.gltf` from the Quaternius RPG Character Pack:
https://quaternius.com/packs/rpgcharacters.html

The author publishes the pack under CC0 1.0. The downloaded license is kept at
`sources/3d/LICENSE.txt`. The model is self-contained glTF 2.0 with embedded
textures, one skin and fifteen animation clips.

Magenta raster sources are intentional authoring inputs. The Visual Forge
compiler derives RGBA atlases locally and never ships the matte source as the
runtime artifact.

The reviewed evidence under `previews/` contains:

- `goblin-shaman-2d.png`, compiler v2 output SHA-256
  `5d2a053fa2f09c36ba5570a9ae92c0b4bf8f33d641139fddd3adec03cdd58b9c`;
- `goblin-shaman-2.5d.png`, compiler v2 output SHA-256
  `36d329929eeb7534e31f5cafa63bbaefc7a7d40ecc4dc85f81f86a5cd4fc641f`;
- `wizard-3d-reference.jpg`, the CC0 pack preview SHA-256
  `9341f9136b1e846a211333892b7814e3c5eee5428313e6d2089f8e222f02f7d0`.
