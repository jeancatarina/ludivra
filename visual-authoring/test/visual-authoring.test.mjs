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
  compileRasterProduction,
  compileTexture,
  inspectProductionGltf,
  inspectProductionGltfBytes,
  parseStyleBible,
  productionCacheKey,
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

function gltfToGlb(source) {
  const gltf = JSON.parse(source);
  const binary = Buffer.from(gltf.buffers[0].uri.split(",")[1], "base64");
  delete gltf.buffers[0].uri;
  const jsonSource = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadding = (4 - jsonSource.length % 4) % 4;
  const binaryPadding = (4 - binary.length % 4) % 4;
  const json = Buffer.concat([jsonSource, Buffer.alloc(jsonPadding, 0x20)]);
  const paddedBinary = Buffer.concat([binary, Buffer.alloc(binaryPadding)]);
  const glb = Buffer.alloc(12 + 8 + json.length + 8 + paddedBinary.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  const binaryHeader = 20 + json.length;
  glb.writeUInt32LE(paddedBinary.length, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  paddedBinary.copy(glb, binaryHeader + 8);
  return glb;
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

test("production contracts compile final 2D, 2.5D and validate a rigged animated 3D source", () => {
  const productionRoot = resolve(fixtureRoot, "production");
  const productionSpec = JSON.parse(readFileSync(
    resolve(productionRoot, "visuals/goblin-shaman-production.character.json"),
    "utf8"
  ));
  const wizardSpec = JSON.parse(readFileSync(
    resolve(productionRoot, "visuals/wizard-production.character.json"),
    "utf8"
  ));
  const validator = new Ajv2020({ allErrors: true, strict: false });
  const characterValidator = validator.compile(
    JSON.parse(readFileSync(resolve(root, "schemas/character-spec-v2.schema.json"), "utf8"))
  );
  assert.ok(characterValidator(productionSpec), JSON.stringify(characterValidator.errors));
  assert.ok(characterValidator(wizardSpec), JSON.stringify(characterValidator.errors));

  const [cutout, directional] = productionSpec.outputs;
  const [model] = wizardSpec.outputs;
  const cutoutBytes = readFileSync(resolve(productionRoot, cutout.source.path));
  const directionsBytes = readFileSync(resolve(productionRoot, directional.source.path));
  const modelSource = readFileSync(resolve(productionRoot, model.source.path), "utf8");
  assert.equal(hash(cutoutBytes), cutout.source.provenance.sha256);
  assert.equal(hash(directionsBytes), directional.source.provenance.sha256);
  assert.equal(hash(modelSource), model.source.provenance.sha256);

  const compiled2d = compileRasterProduction(cutoutBytes, cutout);
  const compiled25d = compileRasterProduction(directionsBytes, directional);
  const compiled3d = inspectProductionGltf(modelSource, model);
  const compiledGlb = inspectProductionGltfBytes(gltfToGlb(modelSource), model);
  assert.equal(compiled2d.report.status, "passed", JSON.stringify(compiled2d.report.checks));
  assert.equal(compiled2d.metadata.frames.length, 1);
  assert.equal(PNG.sync.read(compiled2d.atlas).colorType, 6);
  assert.equal(hash(compiled2d.atlas), "5d2a053fa2f09c36ba5570a9ae92c0b4bf8f33d641139fddd3adec03cdd58b9c");
  assert.equal(compiled25d.report.status, "passed", JSON.stringify(compiled25d.report.checks));
  assert.deepEqual(compiled25d.metadata.frames.map(({ direction }) => direction), directional.source.directions);
  assert.equal(hash(compiled25d.atlas), "36d329929eeb7534e31f5cafa63bbaefc7a7d40ecc4dc85f81f86a5cd4fc641f");
  assert.equal(compiled3d.status, "passed", JSON.stringify(compiled3d.checks));
  assert.equal(compiledGlb.status, "passed", JSON.stringify(compiledGlb.checks));
  assert.equal(compiledGlb.metrics.triangles, compiled3d.metrics.triangles);
  assert.ok(compiled3d.metrics.animations.includes("Idle"));
  assert.ok(compiled3d.metrics.triangles > 0);

  const hashes = Object.fromEntries(productionSpec.outputs.map((output) => [output.id, output.source.provenance.sha256]));
  const style = readFileSync(resolve(productionRoot, "styles/stylized/style.yaml"), "utf8");
  assert.equal(
    productionCacheKey(productionSpec, style, hashes),
    productionCacheKey(productionSpec, style, Object.fromEntries(Object.entries(hashes).reverse()))
  );
  assert.equal(hash(compiled2d.atlas), hash(compileRasterProduction(cutoutBytes, cutout).atlas));
});
