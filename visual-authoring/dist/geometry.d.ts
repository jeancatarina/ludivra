import type { CharacterSpec, VisualStyleBible } from "./spec.js";
export type Vector3 = [number, number, number];
export interface BoneDefinition {
    name: string;
    parent: number;
    start: Vector3;
    end: Vector3;
    radiusStart: number;
    radiusEnd: number;
}
export interface SurfaceSegment extends BoneDefinition {
    skinBone: number;
    color: string;
}
export interface CharacterGeometry {
    skeleton: BoneDefinition[];
    segments: SurfaceSegment[];
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    joints: Uint16Array;
    weights: Float32Array;
    indices: Uint32Array;
    bounds: {
        min: Vector3;
        max: Vector3;
    };
}
export declare function buildSkeleton(spec: CharacterSpec, style: VisualStyleBible): BoneDefinition[];
export declare function generateCharacterGeometry(spec: CharacterSpec, style: VisualStyleBible): CharacterGeometry;
