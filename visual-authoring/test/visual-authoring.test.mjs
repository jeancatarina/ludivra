import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { PNG } from "pngjs";
import {
  compileCharacter,
  compileTexture,
  parseStyleBible,
  texturePrompt,
  visualCacheKey
} from "../dist/index.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixtureRoot = resolve(root, "visual-authoring/test/fixtures");
const spec = JSON.parse(readFileSync(resolve(fixtureRoot, "goblin-shaman.character.json"), "utf8"));
const styleSource = readFileSync(resolve(fixtureRoot, "stylized/style.yaml"), "utf8");
const style = parseStyleBible(styleSource);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("published schemas accept the Style Bible and CharacterSpec fixture", () => {
  const validator = new Ajv2020({ allErrors: true, strict: false });
  const textureSchema = JSON.parse(readFileSync(resolve(root, "schemas/texture-request.schema.json"), "utf8"));
  validator.addSchema(textureSchema);
  const styleValidator = validator.compile(
    JSON.parse(readFileSync(resolve(root, "schemas/visual-style.schema.json"), "utf8"))
  );
  const characterValidator = validator.compile(
    JSON.parse(readFileSync(resolve(root, "schemas/character-spec.schema.json"), "utf8"))
  );
  assert.ok(styleValidator(style), JSON.stringify(styleValidator.errors));
  assert.ok(characterValidator(spec), JSON.stringify(characterValidator.errors));
  assert.equal(characterValidator({ ...spec, archetype: { body: "quadruped", head: "goblin" } }), false);
  assert.equal(styleValidator({ ...style, geometry: { ...style.geometry, triangleBudget: { min: 1, max: 2 } } }), false);
});

test("skeleton-first compilation is deterministic, rigged and within the visual budget", () => {
  const first = compileCharacter(spec, style);
  const second = compileCharacter(spec, style);
  assert.equal(first.validation.status, "passed");
  assert.equal(first.validation.metrics.triangles, 15200);
  assert.equal(first.validation.metrics.vertices, 8000);
  assert.equal(first.validation.metrics.bones, 21);
  assert.equal(first.validation.metrics.weightedVertices, 8000);
  assert.ok(first.validation.metrics.maxInfluences <= 4);
  assert.equal(first.validation.metrics.degenerateTriangles, 0);
  assert.equal(first.validation.metrics.invalidWeights, 0);
  assert.equal(first.validation.metrics.invalidNormals, 0);

  assert.equal(hash(first.model.gltf), hash(second.model.gltf));
  assert.equal(hash(first.model.binary), hash(second.model.binary));
  assert.equal(hash(first.preview), hash(second.preview));
  assert.equal(visualCacheKey(spec, style), visualCacheKey(spec, style));
  assert.equal(
    visualCacheKey(Object.fromEntries(Object.entries(spec).reverse()), style),
    visualCacheKey(spec, style),
    "document key order must not alter the cache identity"
  );

  const gltf = JSON.parse(first.model.gltf);
  assert.equal(gltf.asset.version, "2.0");
  assert.match(gltf.buffers[0].uri, /^data:application\/octet-stream;base64,/);
  assert.equal(gltf.skins[0].joints.length, 21);
  assert.deepEqual(gltf.animations.map(({ name }) => name), spec.animations);
  assert.match(first.preview, /front/);
  assert.match(first.preview, /three-quarter/);
  assert.match(first.preview, /turntable/);
});

test("texture compiler derives technical maps locally and enforces tiling", () => {
  const image = new PNG({ width: 512, height: 512 });
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const value = ((x % 32) + (y % 32)) % 32 * 7;
      image.data.set([value, 80 + value / 2, 40, 255], offset);
    }
  }
  // Tile boundaries are identical by construction.
  for (let y = 0; y < image.height; y += 1) {
    const first = y * image.width * 4;
    const last = (y * image.width + image.width - 1) * 4;
    image.data.copy(image.data, last, first, first + 4);
  }
  for (let x = 0; x < image.width; x += 1) {
    const first = x * 4;
    const last = ((image.height - 1) * image.width + x) * 4;
    image.data.copy(image.data, last, first, first + 4);
  }
  const input = PNG.sync.write(image);
  const request = {
    id: "surface.cloth",
    kind: "swatch",
    material: "cloth",
    projection: "triplanar",
    resolution: 512,
    origin: "generated",
    license: "project_owned",
    requirements: { tileable: true },
    artDirection: "woven violet cloth",
    negative: ["normal-map", "roughness-map", "transparent-background"]
  };
  const compiled = compileTexture(input, request, style);
  assert.deepEqual(compiled.issues, []);
  assert.ok(compiled.edgeDelta < 0.001);
  for (const map of Object.values(compiled.maps)) {
    assert.match(map.sha256, /^[a-f0-9]{64}$/);
    assert.ok(map.bytes.length > 100);
  }
  const prompt = texturePrompt(style, request);
  assert.match(prompt, /seamless tile/);
  assert.match(prompt, /normal-map/);
  assert.match(prompt, /no transparency|transparent-background/);
});
