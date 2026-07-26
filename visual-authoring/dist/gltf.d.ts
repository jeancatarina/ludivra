import type { CharacterGeometry } from "./geometry.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
export interface GltfArtifact {
    json: string;
    binary: Buffer;
}
export declare function buildGltf(spec: CharacterSpec, style: VisualStyleBible, geometry: CharacterGeometry): GltfArtifact;
