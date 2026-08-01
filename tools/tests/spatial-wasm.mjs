import assert from "node:assert/strict";
import createModule from "../../runtime-wasm/generated/ludivra-runtime.mjs";
import { LudivraSpatialWorld } from "../../runtime-web/dist/index.js";

const module = await createModule();
const world = LudivraSpatialWorld.create(module, { dimension: 7, regionExtentChunks: 2 });
try {
  world.put(2, { dimension: 7, xMilli: 65_000n, yMilli: 0n, zMilli: 0n });
  world.put(1, { dimension: 7, xMilli: 63_500n, yMilli: 0n, zMilli: 0n });
  world.translate(1, { xMilli: 1_000n, yMilli: 0n, zMilli: 0n });
  const location = world.locate(1);
  assert.equal(location.region.x, 1);
  assert.equal(location.position.xMilli, 64_500n);
  assert.deepEqual(world.entitiesIn(location.region), [1, 2]);
} finally {
  world.destroy();
}

process.stdout.write("spatial_wasm=PASS\n");
