import type { CharacterSpec, VisualStyleBible } from "./spec.js";
export type Vector3 = [number, number, number];
export type SurfaceClass = 0 | 1 | 2 | 3 | 4 | 5;
export declare const SURFACE: {
    readonly skin: 0;
    readonly cloth: 1;
    readonly leather: 2;
    readonly hair: 3;
    readonly glossy: 4;
    readonly hard: 5;
};
export declare const SURFACE_NAMES: readonly ["skin", "cloth", "leather", "hair", "glossy", "hard"];
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
    texcoords: Float32Array;
    joints: Uint16Array;
    weights: Float32Array;
    indices: Uint32Array;
    triangleSurfaces: Uint8Array;
    bounds: {
        min: Vector3;
        max: Vector3;
    };
    qualityMetrics: {
        organicTriangles: number;
        organicVertexRatio: number;
        semanticDetails: number;
    };
}
export declare function buildSkeleton(spec: CharacterSpec, style: VisualStyleBible): BoneDefinition[];
export declare function generateCharacterGeometry(spec: CharacterSpec, style: VisualStyleBible): CharacterGeometry;
