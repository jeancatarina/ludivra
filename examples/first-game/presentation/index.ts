import type {
  CreateGamePresenter,
  PresentationState
} from "@ludivra/presentation-protocol";

const scoreKey = 1;

export const createGamePresenter: CreateGamePresenter = (renderer) => {
  renderer.createVisual({ id: "core", shape: "sphere", color: 0x9b7cff });
  renderer.createVisual({
    id: "orbit",
    shape: "ring",
    color: 0x46e6c4,
    scale: [2, 2, 2]
  });

  return {
    present(state: PresentationState) {
      const tick = Number(state.tick % 10_000n);
      const score = Number(state.integer(scoreKey));
      const pulse = 1 + Math.min(score, 20) * 0.025;
      renderer.setTransform("core", {
        position: [0, 0, 0],
        rotation: [tick * 0.006, tick * 0.009, 0],
        scale: [pulse, pulse, pulse]
      });
      renderer.setTransform("orbit", {
        position: [0, 0, -0.4],
        rotation: [0, 0, tick * -0.004]
      });
      renderer.setColor("core", score % 2 === 0 ? 0x9b7cff : 0xff78bd);
    },
    destroy() {}
  };
};
