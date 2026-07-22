import type {
  CreateGamePresenter,
  PresentationState
} from "@ludivra/presentation-protocol";

interface RunContent {
  phases: Record<"idle" | "combat" | "reward" | "victory" | "defeat", number>;
  rooms: Array<{ enemy: { health: number } }>;
}

interface GameBinding {
  inspection: { integerStates: Array<{ id: string; key: number }> };
}

export const createGamePresenter: CreateGamePresenter = (renderer, context) => {
  const run = context.content<RunContent>("ember-vault.run");
  const game = context.content<GameBinding>("ludivra.game");
  const key = new Map(game.inspection.integerStates.map((state) => [state.id, state.key]));
  const stateKey = (id: string): number => {
    const value = key.get(id);
    if (value === undefined) throw new Error(`presentation state does not exist: ${id}`);
    return value;
  };
  renderer.setCamera({ position: [0, 6.8, 10.5], target: [0, -0.5, -1.4], fieldOfView: 40 });
  renderer.setAtmosphere({
    fogColor: 0x10080d,
    fogDensity: 0.028,
    ambientColor: 0x5f355c,
    ambientIntensity: 1.1,
    keyColor: 0xffc38a,
    keyIntensity: 3.2,
    fillColor: 0xff5f3d,
    fillIntensity: 18
  });
  renderer.createVisual({ id: "player", shape: "ring", color: 0x67e8d2, surface: "emissive", scale: [1.1, 1.1, 1.1] });
  renderer.createVisual({ id: "enemy", shape: "octahedron", color: 0xff5f56, surface: "emissive", scale: [1.5, 1.5, 1.5] });
  renderer.createVisual({ id: "card-strike", shape: "box", color: 0xed725f, surface: "matte" });
  renderer.createVisual({ id: "card-guard", shape: "box", color: 0x4ae0c1, surface: "matte" });
  renderer.createVisual({ id: "card-surge", shape: "box", color: 0xe8b84a, surface: "matte" });
  const cards = ["card-strike", "card-guard", "card-surge"];

  return {
    present(state: PresentationState) {
      const tick = Number(state.tick % 10_000n);
      const phase = Number(state.integer(stateKey("phase")));
      const room = Math.max(1, Number(state.integer(stateKey("room"))));
      const enemyHealth = Number(state.integer(stateKey("enemy.health")));
      const roomHealth = run.rooms[room - 1]?.enemy.health ?? 1;
      const enemyScale = 0.8 + Math.max(0, enemyHealth) / Math.max(1, roomHealth) * 0.7;
      const combat = phase === run.phases.combat;
      renderer.setVisible("enemy", combat && enemyHealth > 0);
      renderer.setTransform("enemy", {
        position: [2.5, 0.7 + Math.sin(tick * 0.03) * 0.12, -1.6],
        rotation: [tick * 0.006, tick * -0.012, 0],
        scale: [enemyScale, enemyScale, enemyScale]
      });
      const playerHealth = Number(state.integer(stateKey("player.health")));
      const playerPulse = phase === run.phases.victory ? 1.25 + Math.sin(tick * 0.08) * 0.12 : 1;
      renderer.setTransform("player", {
        position: [-2.5, 0.25, -0.8],
        rotation: [0, 0, tick * 0.008],
        scale: [playerPulse, playerPulse, playerPulse]
      });
      renderer.setColor("player", phase === run.phases.defeat || playerHealth <= 0 ? 0x782f45 : phase === run.phases.victory ? 0xffd766 : 0x67e8d2);
      for (let index = 0; index < cards.length; index += 1) {
        const id = cards[index];
        if (id === undefined) continue;
        renderer.setVisible(id, combat);
        renderer.setTransform(id, {
          position: [-2.2 + index * 2.2, -2.25 + Math.sin(tick * 0.025 + index) * 0.05, 0],
          rotation: [-0.08, 0.08 * (index - 1), 0],
          scale: [1.35, 0.12, 1.9]
        });
      }
    },
    destroy() {}
  };
};
