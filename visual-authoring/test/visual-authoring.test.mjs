import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { PNG } from "pngjs";
import {
  buildHumanoidBlueprint,
  compileCharacter,
  compileGeneratedRaster,
  compileTexture,
  parseStyleBible,
  productionCacheKey,
  productionCharacterRecipe,
  texturePrompt,
  validateGeneratedModel,
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

function embeddedPng(image) {
  return Buffer.from(image.uri.slice(image.uri.indexOf(",") + 1), "base64");
}

function channelRange(bytes, channel) {
  const image = PNG.sync.read(bytes);
  let minimum = 255;
  let maximum = 0;
  for (let offset = channel; offset < image.data.length; offset += 4) {
    minimum = Math.min(minimum, image.data[offset]);
    maximum = Math.max(maximum, image.data[offset]);
  }
  return maximum - minimum;
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
  assert.ok(first.validation.metrics.triangles >= 40000);
  assert.ok(first.validation.metrics.vertices >= 20000);
  assert.equal(first.validation.metrics.bones, 21);
  assert.equal(first.validation.metrics.weightedVertices, first.validation.metrics.vertices);
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

test("production contracts generate final 2D, 2.5D and rigged 3D from one local recipe", () => {
  const productionRoot = resolve(fixtureRoot, "production");
  const productionSpec = JSON.parse(readFileSync(
    resolve(productionRoot, "visuals/goblin-shaman-production.character.json"),
    "utf8"
  ));
  const validator = new Ajv2020({ allErrors: true, strict: false });
  const characterValidator = validator.compile(
    JSON.parse(readFileSync(resolve(root, "schemas/character-spec-v2.schema.json"), "utf8"))
  );
  assert.ok(characterValidator(productionSpec), JSON.stringify(characterValidator.errors));
  assert.equal(
    characterValidator({
      ...productionSpec,
      outputs: [{ ...productionSpec.outputs[0], source: { path: "foreign.png" } }]
    }),
    false,
    "schema v2 must reject every external visual source"
  );
  assert.equal(characterValidator({ ...productionSpec, surfaces: [{ path: "foreign-texture.png" }] }), false);

  const productionStyleSource = readFileSync(resolve(productionRoot, "styles/stylized/style.yaml"), "utf8");
  const productionStyle = parseStyleBible(productionStyleSource);
  const canonical = compileCharacter(productionCharacterRecipe(productionSpec), productionStyle);
  const [cutout, directional, model] = productionSpec.outputs;
  const compiled2d = compileGeneratedRaster(canonical, productionSpec, productionStyle, cutout);
  const compiled25d = compileGeneratedRaster(canonical, productionSpec, productionStyle, directional);
  const compiled3d = validateGeneratedModel(canonical, productionSpec, model);
  assert.equal(compiled2d.report.status, "passed", JSON.stringify(compiled2d.report.checks));
  assert.equal(compiled2d.metadata.frames.length, 1);
  assert.equal(PNG.sync.read(compiled2d.atlas).colorType, 6);
  assert.equal(compiled25d.report.status, "passed", JSON.stringify(compiled25d.report.checks));
  assert.deepEqual(compiled25d.metadata.frames.map(({ direction }) => direction), directional.directions);
  assert.equal(compiled3d.status, "passed", JSON.stringify(compiled3d.checks));
  assert.ok(compiled3d.metrics.animations.includes("idle"));
  assert.ok(compiled3d.metrics.triangles > 0);
  assert.ok(compiled3d.metrics.organicVertexRatio >= 0.7);
  assert.ok(compiled3d.metrics.organicTriangles >= 60000);
  assert.ok(compiled3d.metrics.semanticDetails >= 20);
  assert.ok(compiled2d.report.checks.some(({ id, status }) => id === "organic-surface" && status === "passed"));
  assert.equal(JSON.parse(canonical.model.gltf).images.length, 18);
  assert.equal(productionCacheKey(productionSpec, productionStyleSource), productionCacheKey(productionSpec, productionStyleSource));
  assert.equal(hash(compiled2d.atlas), hash(compileGeneratedRaster(canonical, productionSpec, productionStyle, cutout).atlas));
  assert.equal(
    hash(compiled2d.atlas),
    hash(readFileSync(resolve(productionRoot, "generated/goblin-shaman-2d.png"))),
    "the checked-in 2D evidence must be a byte-identical Forge output"
  );
  assert.equal(
    hash(compiled25d.atlas),
    hash(readFileSync(resolve(productionRoot, "generated/goblin-shaman-2.5d.png"))),
    "the checked-in directional evidence must be a byte-identical Forge output"
  );
});

test("hero-mascot profile produces a complete first-pass humanoid without visual inputs", () => {
  const productionRoot = resolve(fixtureRoot, "production");
  const mascotSpec = JSON.parse(readFileSync(
    resolve(productionRoot, "visuals/indie-mechanic-mascot.character.json"),
    "utf8"
  ));
  const mascotStyleSource = readFileSync(resolve(productionRoot, "styles/mascot/style.yaml"), "utf8");
  const mascotStyle = parseStyleBible(mascotStyleSource);
  const recipe = productionCharacterRecipe(mascotSpec);
  const blueprint = buildHumanoidBlueprint(recipe, mascotStyle);
  assert.equal(blueprint.profile, "hero-mascot");
  assert.deepEqual(mascotSpec.surfaces, []);

  const canonical = compileCharacter(recipe, mascotStyle);
  const [cutout, directional, modelOutput] = mascotSpec.outputs;
  const compiled2d = compileGeneratedRaster(canonical, mascotSpec, mascotStyle, cutout);
  const compiled25d = compileGeneratedRaster(canonical, mascotSpec, mascotStyle, directional);
  const compiled3d = validateGeneratedModel(canonical, mascotSpec, modelOutput);
  assert.equal(canonical.validation.status, "passed", JSON.stringify(canonical.validation.checks));
  assert.equal(compiled2d.report.status, "passed", JSON.stringify(compiled2d.report.checks));
  assert.equal(compiled25d.report.status, "passed", JSON.stringify(compiled25d.report.checks));
  assert.equal(compiled3d.status, "passed", JSON.stringify(compiled3d.checks));
  assert.ok(canonical.validation.metrics.organicVertexRatio >= blueprint.gates.minimumOrganicRatio);
  assert.ok(canonical.validation.metrics.semanticDetails >= blueprint.gates.minimumSemanticDetails);
  assert.ok(canonical.validation.metrics.surfaceClasses >= blueprint.gates.minimumSurfaceClasses);
  assert.equal(canonical.validation.metrics.profileModules, blueprint.gates.requiredModules.length);
  assert.ok(
    canonical.validation.metrics.eyeNoseClearanceM >= mascotSpec.anatomy.heightM * blueprint.gates.minimumEyeNoseClearance
  );
  assert.ok(canonical.validation.checks.some(({ id, status }) => id === "facial-layout" && status === "passed"));
  assert.equal(compiled3d.metrics.materials, 6);
  assert.equal(compiled3d.metrics.textures, 18);
  assert.equal(compiled3d.metrics.animations.length, 7);
  const gltf = JSON.parse(canonical.model.gltf);
  assert.equal(gltf.meshes[0].primitives.length, 6);
  assert.deepEqual(
    gltf.materials.map(({ extras }) => extras.semanticSurface),
    ["skin", "cloth", "leather", "hair", "glossy", "hard"]
  );
  const albedoImages = gltf.images.filter(({ name }) => name.endsWith(".albedo"));
  const normalImages = gltf.images.filter(({ name }) => name.endsWith(".normal"));
  const roughnessImages = gltf.images.filter(({ name }) => name.endsWith(".roughness"));
  assert.equal(albedoImages.length, 6);
  assert.equal(normalImages.length, 6);
  assert.equal(roughnessImages.length, 6);
  assert.equal(new Set(albedoImages.map((image) => hash(embeddedPng(image)))).size, 6);
  assert.equal(new Set(normalImages.map((image) => hash(embeddedPng(image)))).size, 6);
  assert.equal(new Set(roughnessImages.map((image) => hash(embeddedPng(image)))).size, 6);
  const clothAlbedo = albedoImages.find(({ name }) => name.includes(".cloth."));
  const clothNormal = normalImages.find(({ name }) => name.includes(".cloth."));
  assert.ok(clothAlbedo);
  assert.ok(clothNormal);
  assert.ok(channelRange(embeddedPng(clothAlbedo), 0) >= 18, "cloth albedo must retain visible woven variation");
  assert.ok(channelRange(embeddedPng(clothNormal), 0) >= 20, "cloth normal map must retain woven relief");
  assert.equal(
    hash(compiled2d.atlas),
    hash(readFileSync(resolve(productionRoot, "generated/indie-mechanic-mascot-2d.png"))),
    "the checked-in mascot cutout must be a byte-identical first-pass Forge output"
  );
  assert.equal(
    hash(compiled25d.atlas),
    hash(readFileSync(resolve(productionRoot, "generated/indie-mechanic-mascot-2.5d.png"))),
    "the checked-in mascot directions must be byte-identical first-pass Forge output"
  );
});
