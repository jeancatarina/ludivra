# Agentes do jogo

Leia `PROJECT_STATE.json`, `game.jsonc` e os guardrails da engine antes de alterar o projeto.

- Gameplay pertence a `scripts/` e só altera estado por `ctx.commands`.
- Apresentação pertence a `presentation/` e usa apenas o protocolo público; Three.js é proibido.
- IDs de ação e estado têm uma única definição lógica e não podem ser renumerados sem migração.
- Execute `game validate`, `game test`, `game build --target web` e uma captura antes de concluir mudanças visuais.
