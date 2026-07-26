export type MaterialKind = "skin" | "cloth" | "leather" | "wood" | "bone" | "metal" | "stone" | "crystal";
export type AnimationKind = "idle" | "walk" | "run" | "attack" | "cast" | "hit" | "death" | "interact";
export interface TextureRequest {
    id: string;
    kind: "swatch" | "decal" | "mask" | "concept";
    material: MaterialKind;
    projection: "triplanar" | "semantic-region" | "decal" | "reference-only";
    resolution: 512 | 1024;
    origin: string;
    license: string;
    requirements?: {
        tileable?: boolean;
        monochrome?: boolean;
    };
    artDirection: string;
    negative: Array<"normal-map" | "roughness-map" | "full-character-uv" | "transparent-background" | "text" | "photorealism">;
}
export interface VisualStyleBible {
    schemaVersion: 1;
    id: string;
    geometry: {
        style: "faceted" | "smooth" | "low-poly";
        silhouette: "compact" | "balanced" | "exaggerated";
        asymmetry: number;
        detailFrequency: number;
        triangleBudget: {
            min: number;
            max: number;
        };
    };
    proportions: {
        heightM: {
            min: number;
            max: number;
        };
        headScale: {
            min: number;
            max: number;
        };
        shoulderScale: {
            min: number;
            max: number;
        };
    };
    roughnessBias: number;
    palette: Record<string, string>;
    render: {
        camera: "isometric";
        outlineStrength: number;
        shadowSoftness: number;
    };
}
export interface CharacterSpec {
    schemaVersion: 1;
    id: string;
    style: string;
    seed: number;
    archetype: {
        body: "small-humanoid" | "medium-humanoid";
        head: "human" | "goblin" | "orc" | "skeleton" | "simple-demon";
    };
    anatomy: {
        heightM: number;
        headScale: number;
        shoulderScale: number;
        armScale: number;
        legScale: number;
        posture: number;
    };
    face: {
        generator: "human" | "goblin" | "orc" | "skeleton" | "simple-demon";
        eyes: number;
        jaw: number;
        nose: number;
    };
    skin: MaterialKind;
    clothing: Array<{
        type: "tunic" | "robe" | "cape" | "light-armor" | "wraps";
        material: MaterialKind;
        colorRole: string;
        fit: number;
        asymmetry: number;
    }>;
    equipment: Array<{
        type: "sword" | "axe" | "staff" | "shield" | "bow";
        material: MaterialKind;
        hand: "left" | "right" | "both";
        scale: number;
    }>;
    accessories: Array<{
        type: "horns" | "bones" | "mask" | "pouch" | "necklace" | "crystal";
        material: MaterialKind;
        anchor: "head" | "chest" | "waist" | "left-hand" | "right-hand";
        scale: number;
    }>;
    animations: AnimationKind[];
    effects?: Array<{
        id: string;
        colorRole: string;
        anchor: "head" | "left-hand" | "right-hand" | "chest" | "feet";
    }>;
    surfaces: TextureRequest[];
}
export declare function parseStyleBible(source: string): VisualStyleBible;
export declare function texturePrompt(style: VisualStyleBible, request: TextureRequest): string;
