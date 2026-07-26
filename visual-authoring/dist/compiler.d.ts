import { type CharacterGeometry } from "./geometry.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
import { type VisualValidationReport } from "./validation.js";
export declare const VISUAL_GENERATOR_VERSION = 2;
export declare function visualCacheKey(spec: CharacterSpec, style: VisualStyleBible, textureHashes?: Record<string, string>): string;
export interface CompiledCharacter {
    geometry: CharacterGeometry;
    model: {
        gltf: string;
        binary: Buffer;
    };
    preview: string;
    validation: VisualValidationReport;
    material: {
        schemaVersion: 1;
        base: {
            material: string;
            color: string;
            roughness: number;
            mapping: "triplanar";
        };
        proceduralLayers: Array<{
            type: string;
            strength: number;
        }>;
        generatedLayers: Array<{
            request: string;
            blend: "multiply" | "overlay";
            strength: number;
        }>;
    };
}
export declare function compileCharacter(spec: CharacterSpec, style: VisualStyleBible): CompiledCharacter;
