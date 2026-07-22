# Agentes do jogo

Execute `game status --project . --format json`; depois leia `.ludivra/project-state.json`, `game.jsonc` e os guardrails da engine antes de alterar o projeto.

- Gameplay pertence a `scripts/` e só altera estado por `ctx.commands`.
- Apresentação pertence a `presentation/` e usa apenas o protocolo público; Three.js é proibido.
- IDs de ação e estado têm uma única definição lógica e não podem ser renumerados sem migração.
- Execute `game validate`, o cenário declarado com `game simulate`, `game test`, `game build --target web` e uma captura antes de concluir mudanças visuais.
- Mantenha `scenarios/charge-core.jsonc` coerente com qualquer mudança nos IDs de ação ou estado inspecionável.
- Nunca edite `.ludivra/project-state.json`; ele é regenerado por `game status`.
