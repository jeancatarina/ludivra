import type { CharacterSpec, VisualStyleBible } from "./spec.js";
export type HumanoidGenerationProfile = "hero-mascot" | "stylized-hero" | "compact-creature";
export interface HumanoidBlueprint {
    profile: HumanoidGenerationProfile;
    skeleton: {
        hipBase: number;
        hipLegResponse: number;
        shoulderHeight: number;
        neckHeight: number;
        shoulderHalf: number;
        upperArm: number;
        lowerArm: number;
    };
    anatomy: {
        headRadius: number;
        headWidth: number;
        headHeight: number;
        headDepth: number;
        torsoWidth: number;
        torsoHeight: number;
        torsoDepth: number;
        hipWidth: number;
        hipHeight: number;
        hipDepth: number;
        organicBlend: number;
    };
    face: {
        eyeSpread: number;
        eyeRadius: number;
        eyeFront: number;
        noseRadius: number;
        noseFront: number;
        noseVerticalOffset: number;
        noseHeight: number;
        mouthWidth: number;
    };
    hands: {
        palmLength: number;
        palmWidth: number;
        palmDepth: number;
        fingerLength: number;
        fingerRadius: number;
        fingerSpread: number;
    };
    footwear: {
        width: number;
        height: number;
        length: number;
    };
    render: {
        frameHeight: number;
        frameWidth: number;
        floor: number;
    };
    gates: {
        minimumOrganicRatio: number;
        minimumSemanticDetails: number;
        minimumSurfaceClasses: number;
        minimumEyeNoseClearance: number;
        requiredModules: Array<"hair" | "hands" | "footwear" | "outfit" | "headwear">;
    };
}
export declare function buildHumanoidBlueprint(spec: CharacterSpec, _style?: VisualStyleBible): HumanoidBlueprint;
