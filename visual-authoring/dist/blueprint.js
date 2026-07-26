const profiles = {
    "hero-mascot": {
        profile: "hero-mascot",
        skeleton: {
            hipBase: 0.34,
            hipLegResponse: 0.15,
            shoulderHeight: 0.77,
            neckHeight: 0.86,
            shoulderHalf: 0.16,
            upperArm: 0.16,
            lowerArm: 0.15
        },
        anatomy: {
            headRadius: 0.106,
            headWidth: 1.08,
            headHeight: 1.16,
            headDepth: 0.92,
            torsoWidth: 0.145,
            torsoHeight: 0.19,
            torsoDepth: 0.105,
            hipWidth: 0.13,
            hipHeight: 0.105,
            hipDepth: 0.1,
            organicBlend: 0.026
        },
        face: {
            eyeSpread: 0.062,
            eyeRadius: 0.035,
            eyeFront: 0.19,
            noseRadius: 0.34,
            noseFront: 1.06,
            noseVerticalOffset: -0.48,
            noseHeight: 0.72,
            mouthWidth: 0.055
        },
        hands: {
            palmLength: 0.052,
            palmWidth: 0.047,
            palmDepth: 0.041,
            fingerLength: 0.038,
            fingerRadius: 0.017,
            fingerSpread: 0.028
        },
        footwear: { width: 0.068, height: 0.057, length: 0.112 },
        render: { frameHeight: 0.84, frameWidth: 0.9, floor: 0.93 },
        gates: {
            minimumOrganicRatio: 0.75,
            minimumSemanticDetails: 18,
            minimumSurfaceClasses: 5,
            minimumEyeNoseClearance: 0.008,
            requiredModules: ["hair", "hands", "footwear", "outfit", "headwear"]
        }
    },
    "stylized-hero": {
        profile: "stylized-hero",
        skeleton: {
            hipBase: 0.37,
            hipLegResponse: 0.17,
            shoulderHeight: 0.75,
            neckHeight: 0.87,
            shoulderHalf: 0.155,
            upperArm: 0.17,
            lowerArm: 0.16
        },
        anatomy: {
            headRadius: 0.082,
            headWidth: 1.02,
            headHeight: 1.1,
            headDepth: 0.94,
            torsoWidth: 0.14,
            torsoHeight: 0.2,
            torsoDepth: 0.1,
            hipWidth: 0.12,
            hipHeight: 0.1,
            hipDepth: 0.095,
            organicBlend: 0.023
        },
        face: {
            eyeSpread: 0.04,
            eyeRadius: 0.026,
            eyeFront: 0.15,
            noseRadius: 0.3,
            noseFront: 0.92,
            noseVerticalOffset: -0.36,
            noseHeight: 0.78,
            mouthWidth: 0.048
        },
        hands: {
            palmLength: 0.05,
            palmWidth: 0.04,
            palmDepth: 0.034,
            fingerLength: 0.034,
            fingerRadius: 0.014,
            fingerSpread: 0.021
        },
        footwear: { width: 0.055, height: 0.045, length: 0.09 },
        render: { frameHeight: 0.84, frameWidth: 0.9, floor: 0.93 },
        gates: {
            minimumOrganicRatio: 0.72,
            minimumSemanticDetails: 14,
            minimumSurfaceClasses: 4,
            minimumEyeNoseClearance: 0.006,
            requiredModules: ["hair", "hands", "footwear", "outfit"]
        }
    },
    "compact-creature": {
        profile: "compact-creature",
        skeleton: {
            hipBase: 0.31,
            hipLegResponse: 0.14,
            shoulderHeight: 0.7,
            neckHeight: 0.83,
            shoulderHalf: 0.17,
            upperArm: 0.17,
            lowerArm: 0.15
        },
        anatomy: {
            headRadius: 0.102,
            headWidth: 1.12,
            headHeight: 1.08,
            headDepth: 0.96,
            torsoWidth: 0.15,
            torsoHeight: 0.2,
            torsoDepth: 0.11,
            hipWidth: 0.14,
            hipHeight: 0.11,
            hipDepth: 0.105,
            organicBlend: 0.027
        },
        face: {
            eyeSpread: 0.047,
            eyeRadius: 0.03,
            eyeFront: 0.112,
            noseRadius: 0.32,
            noseFront: 1.02,
            noseVerticalOffset: -0.28,
            noseHeight: 0.82,
            mouthWidth: 0.052
        },
        hands: {
            palmLength: 0.052,
            palmWidth: 0.044,
            palmDepth: 0.038,
            fingerLength: 0.032,
            fingerRadius: 0.016,
            fingerSpread: 0.023
        },
        footwear: { width: 0.06, height: 0.05, length: 0.095 },
        render: { frameHeight: 0.82, frameWidth: 0.88, floor: 0.92 },
        gates: {
            minimumOrganicRatio: 0.7,
            minimumSemanticDetails: 16,
            minimumSurfaceClasses: 4,
            minimumEyeNoseClearance: 0.005,
            requiredModules: ["hair", "hands", "outfit"]
        }
    }
};
export function buildHumanoidBlueprint(spec, _style) {
    const requested = spec.features?.generationProfile;
    const inferred = requested ??
        (spec.archetype.head === "human" && spec.features?.outfit?.construction === "overalls"
            ? "hero-mascot"
            : spec.archetype.head === "human"
                ? "stylized-hero"
                : "compact-creature");
    return profiles[inferred];
}
