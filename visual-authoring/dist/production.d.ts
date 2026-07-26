export type RenderMode = "2d" | "2.5d" | "3d";
export type QualityTier = "blockout" | "production";
export type Direction = "south" | "south-west" | "west" | "north-west" | "north" | "north-east" | "east" | "south-east";
export interface VisualSourceProvenance {
    origin: string;
    license: string;
    sha256: string;
    generator?: {
        name: string;
        version?: string;
        mode: "built-in" | "api" | "local" | "authored";
        prompt: string;
        seed?: number;
    };
}
export interface RasterRequirements {
    minimumSourceSize: number;
    pixelsPerMeter: number;
    padding: number;
    edgeExtrusion: number;
    pivot: [number, number];
    maximumScaleVariance?: number;
}
export interface RasterProductionOutput {
    id: string;
    mode: "2d" | "2.5d";
    profile: "painted-cutout-2d" | "directional-impostor-2.5d";
    quality: QualityTier;
    source: {
        kind: "raster" | "directional-sheet";
        path: string;
        segmentation?: "alpha-columns";
        directions?: Direction[];
        matte: {
            color: string;
            transparentThreshold: number;
            opaqueThreshold: number;
        };
        provenance: VisualSourceProvenance;
    };
    requirements: RasterRequirements;
    animations: string[];
}
export interface GltfProductionOutput {
    id: string;
    mode: "3d";
    profile: "stylized-pbr-3d";
    quality: QualityTier;
    source: {
        kind: "rigged-gltf";
        path: string;
        provenance: VisualSourceProvenance;
    };
    requirements: {
        minimumAnimations: number;
        requiredAnimations: string[];
        maximumTriangles: number;
        minimumTextureSize: number;
        lods: number;
    };
}
export type ProductionOutput = RasterProductionOutput | GltfProductionOutput;
export interface ProductionCharacterSpec {
    schemaVersion: 2;
    id: string;
    style: string;
    seed: number;
    identity: {
        description: string;
        silhouette: string;
        paletteRoles: string[];
        focalFeatures: string[];
    };
    outputs: ProductionOutput[];
}
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
    sourceBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    pivot: [number, number];
}
export interface CompiledRasterOutput {
    atlas: Buffer;
    metadata: {
        schemaVersion: 1;
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
export declare function compileRasterProduction(sourceBytes: Uint8Array, output: RasterProductionOutput): CompiledRasterOutput;
export declare function inspectProductionGltf(source: string, output: GltfProductionOutput): ProductionValidationReport;
export declare function inspectProductionGltfBytes(source: Uint8Array, output: GltfProductionOutput): ProductionValidationReport;
export declare function productionCacheKey(spec: ProductionCharacterSpec, styleSource: string, sourceHashes: Record<string, string>): string;
