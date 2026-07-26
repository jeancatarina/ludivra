import { type BoneDefinition } from "./geometry.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
export interface OrganicSurface {
    positions: number[];
    normals: number[];
    colors: number[];
    texcoords: number[];
    joints: number[];
    weights: number[];
    indices: number[];
    surfaces: number[];
}
export declare function generateOrganicCharacterSurface(spec: CharacterSpec, style: VisualStyleBible, skeleton: BoneDefinition[]): OrganicSurface;
