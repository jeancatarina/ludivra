import type { CompiledCharacter } from "./compiler.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
export type RenderMode = "2d" | "2.5d" | "3d";
export type QualityTier = "production";
export type Direction = "south" | "south-west" | "west" | "north-west" | "north" | "north-east" | "east" | "south-east";
interface GeneratedOutputBase {
    id: string;
    mode: RenderMode;
    profile: string;
    quality: QualityTier;
}
export interface Generated2dOutput extends GeneratedOutputBase {
    mode: "2d";
    profile: "illustrated-character-2d";
    resolution: number;
    camera: {
        yaw: number;
        pitch: number;
    };
    pixelsPerMeter: number;
    padding: number;
    edgeExtrusion: number;
    animations: string[];
}
export interface Generated25dOutput extends GeneratedOutputBase {
    mode: "2.5d";
    profile: "directional-character-2.5d";
    cellResolution: number;
    directions: Direction[];
    pixelsPerMeter: number;
    padding: number;
    edgeExtrusion: number;
    animations: string[];
}
export interface Generated3dOutput extends GeneratedOutputBase {
    mode: "3d";
    profile: "stylized-pbr-3d";
    requirements: {
        minimumAnimations: number;
        requiredAnimations: string[];
        maximumTriangles: number;
        minimumTextureSize: number;
        lods: number;
    };
}
export type ProductionOutput = Generated2dOutput | Generated25dOutput | Generated3dOutput;
export type ProductionCharacterSpec = Omit<CharacterSpec, "schemaVersion"> & {
    schemaVersion: 2;
    identity: {
        description: string;
        silhouette: string;
        paletteRoles: string[];
        focalFeatures: string[];
    };
    outputs: ProductionOutput[];
};
export interface ProductionCheck {
    id: string;
    status: "passed" | "failed";
    code?: string | undefined;
    message: string;
}
export interface ProductionValidationReport {
    schemaVersion: 1;
    profile: string;
    quality: QualityTier;
    status: "passed" | "failed";
    checks: ProductionCheck[];
    metrics: Record<string, number | string | string[] | number[]>;
}
export interface RasterFrame {
    id: string;
    direction?: Direction | undefined;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    pivot: [number, number];
}
export interface CompiledGeneratedRaster {
    atlas: Buffer;
    metadata: {
        schemaVersion: 2;
        generatedBy: "@ludivra/visual-authoring";
        mode: "2d" | "2.5d";
        profile: string;
        image: {
            width: number;
            height: number;
        };
        pixelsPerMeter: number;
        frames: RasterFrame[];
        animations: Array<{
            id: string;
            frames: string[];
        }>;
    };
    report: ProductionValidationReport;
}
export declare function productionCharacterRecipe(spec: ProductionCharacterSpec): CharacterSpec;
export declare function compileGeneratedRaster(compiled: CompiledCharacter, spec: ProductionCharacterSpec, style: VisualStyleBible, output: Generated2dOutput | Generated25dOutput): CompiledGeneratedRaster;
export declare function validateGeneratedModel(compiled: CompiledCharacter, spec: ProductionCharacterSpec, output: Generated3dOutput): ProductionValidationReport;
export declare function productionCacheKey(spec: ProductionCharacterSpec, styleSource: string): string;
export {};
