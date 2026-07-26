import { createHash } from "node:crypto";
import { stringify as stringifyYaml } from "yaml";
import { buildGltf } from "./gltf.js";
import { generateCharacterGeometry } from "./geometry.js";
import { renderCharacterPreview } from "./preview.js";
import { validateCharacter } from "./validation.js";
export const VISUAL_GENERATOR_VERSION = 3;
export function visualCacheKey(spec, style, textureHashes = {}) {
    return createHash("sha256")
        .update(`${VISUAL_GENERATOR_VERSION}\0${spec.seed}\0${stringifyYaml({ spec, style, textureHashes }, { sortMapEntries: true })}`)
        .digest("hex");
}
export function compileCharacter(spec, style) {
    const geometry = generateCharacterGeometry(spec, style);
    const validation = validateCharacter(spec, style, geometry);
    const model = buildGltf(spec, style, geometry);
    const materialRole = spec.skin;
    return {
        geometry,
        model: { gltf: model.json, binary: model.binary, textures: model.textures },
        preview: renderCharacterPreview(spec, style, geometry, validation),
        validation,
        material: {
            schemaVersion: 1,
            base: {
                material: materialRole,
                color: style.palette[materialRole] ?? style.palette.skin ?? "#7c9d5d",
                roughness: Math.min(1, Math.max(0, 0.62 + style.roughnessBias * 0.25)),
                mapping: "triplanar"
            },
            proceduralLayers: [
                { type: "cellular-noise", strength: 0.18 + style.geometry.detailFrequency * 0.16 },
                { type: "curvature-darkening", strength: 0.16 },
                { type: "joint-warmth", strength: materialRole === "skin" ? 0.12 : 0 }
            ],
            generatedLayers: spec.surfaces
                .filter(({ kind }) => kind !== "concept")
                .map(({ id, kind }) => ({ request: id, blend: kind === "decal" ? "overlay" : "multiply", strength: 0.55 }))
        }
    };
}
