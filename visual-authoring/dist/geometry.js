import { createVisualStream } from "./random.js";
import { buildHumanoidBlueprint } from "./blueprint.js";
import { generateOrganicCharacterSurface } from "./organic.js";
export const SURFACE = {
    skin: 0,
    cloth: 1,
    leather: 2,
    hair: 3,
    glossy: 4,
    hard: 5
};
export const SURFACE_NAMES = ["skin", "cloth", "leather", "hair", "glossy", "hard"];
function add(left, right) {
    return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}
function subtract(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}
function scale(value, factor) {
    return [value[0] * factor, value[1] * factor, value[2] * factor];
}
function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
    ];
}
function length(value) {
    return Math.hypot(value[0], value[1], value[2]);
}
function normalize(value) {
    const magnitude = length(value);
    if (magnitude <= 1e-9)
        return [0, 1, 0];
    return scale(value, 1 / magnitude);
}
function bone(name, parent, start, end, radiusStart, radiusEnd) {
    return { name, parent, start, end, radiusStart, radiusEnd };
}
export function buildSkeleton(spec, style) {
    const blueprint = buildHumanoidBlueprint(spec, style);
    const stream = createVisualStream(spec.seed, "visual.skeleton");
    const height = spec.anatomy.heightM;
    const asymmetry = style.geometry.asymmetry * 0.025;
    const posture = spec.anatomy.posture * height * 0.045;
    const hipY = height * (blueprint.skeleton.hipBase + blueprint.skeleton.hipLegResponse * spec.anatomy.legScale);
    const shoulderY = height * blueprint.skeleton.shoulderHeight;
    const neckY = height * blueprint.skeleton.neckHeight;
    const headTop = height;
    const hipHalf = height * 0.085;
    const shoulderHalf = height * blueprint.skeleton.shoulderHalf * spec.anatomy.shoulderScale;
    const upperArm = height * blueprint.skeleton.upperArm * spec.anatomy.armScale;
    const lowerArm = height * blueprint.skeleton.lowerArm * spec.anatomy.armScale;
    const thigh = hipY * 0.52 * spec.anatomy.legScale;
    const shin = hipY - thigh;
    const headRadius = height * 0.075 * spec.anatomy.headScale *
        (spec.archetype.head === "goblin" ? 1.12 : spec.archetype.head === "skeleton" ? 0.9 : 1);
    const leftDrift = stream.signed() * asymmetry * height;
    const rightDrift = stream.signed() * asymmetry * height;
    const hips = [0, hipY, 0];
    const chest = [0, shoulderY, posture];
    const neck = [0, neckY, posture * 1.15];
    const head = [0, (neckY + headTop) * 0.5, posture * 1.25];
    const leftShoulder = [-shoulderHalf, shoulderY, posture];
    const rightShoulder = [shoulderHalf, shoulderY, posture];
    const presentationPose = spec.features?.presentationPose ?? "relaxed";
    const armDrop = presentationPose === "t-pose" ? 0 : presentationPose === "a-pose" ? 0.32 : 0.62;
    const forearmDrop = presentationPose === "t-pose" ? 0 : presentationPose === "a-pose" ? 0.42 : 0.97;
    const lateralReach = presentationPose === "t-pose" ? 0.98 : presentationPose === "a-pose" ? 0.9 : 0.78;
    const leftElbow = [-shoulderHalf - upperArm * lateralReach, shoulderY - upperArm * armDrop, leftDrift];
    const rightElbow = [shoulderHalf + upperArm * lateralReach, shoulderY - upperArm * armDrop, rightDrift];
    const leftWrist = [leftElbow[0] - lowerArm * (presentationPose === "relaxed" ? 0.25 : 0.9), leftElbow[1] - lowerArm * forearmDrop, leftDrift];
    const rightWrist = [rightElbow[0] + lowerArm * (presentationPose === "relaxed" ? 0.25 : 0.9), rightElbow[1] - lowerArm * forearmDrop, rightDrift];
    const leftHip = [-hipHalf, hipY, 0];
    const rightHip = [hipHalf, hipY, 0];
    const leftKnee = [-hipHalf * 1.12, hipY - thigh, 0.012];
    const rightKnee = [hipHalf * 1.12, hipY - thigh, -0.012];
    const leftAnkle = [-hipHalf, Math.max(0.06, hipY - thigh - shin), 0];
    const rightAnkle = [hipHalf, Math.max(0.06, hipY - thigh - shin), 0];
    const clothingVolume = spec.clothing.some(({ type }) => type === "robe" || type === "light-armor") ? 1.12 : 1;
    const rootRadius = height * 0.105 * clothingVolume;
    const limbRadius = height * (spec.archetype.body === "small-humanoid" ? 0.037 : 0.044);
    const leftHandEnd = presentationPose === "t-pose"
        ? [leftWrist[0] - height * 0.07, leftWrist[1], leftWrist[2]]
        : [leftWrist[0] - height * 0.018, leftWrist[1] - height * 0.07, leftWrist[2]];
    const rightHandEnd = presentationPose === "t-pose"
        ? [rightWrist[0] + height * 0.07, rightWrist[1], rightWrist[2]]
        : [rightWrist[0] + height * 0.018, rightWrist[1] - height * 0.07, rightWrist[2]];
    return [
        bone("hips", -1, hips, [0, hipY + height * 0.11, posture * 0.35], rootRadius, rootRadius * 0.88),
        bone("spine", 0, [0, hipY + height * 0.11, posture * 0.35], chest, rootRadius * 0.88, height * 0.13),
        bone("neck", 1, chest, neck, height * 0.055, height * 0.045),
        bone("head", 2, neck, head, headRadius * 0.72, headRadius),
        bone("head-crown", 3, head, [0, headTop, posture * 1.28], headRadius, headRadius * 0.62),
        bone("left-upper-arm", 1, leftShoulder, leftElbow, limbRadius * 1.18, limbRadius),
        bone("left-lower-arm", 5, leftElbow, leftWrist, limbRadius, limbRadius * 0.72),
        bone("left-hand", 6, leftWrist, leftHandEnd, limbRadius * 0.8, limbRadius * 0.55),
        bone("right-upper-arm", 1, rightShoulder, rightElbow, limbRadius * 1.18, limbRadius),
        bone("right-lower-arm", 8, rightElbow, rightWrist, limbRadius, limbRadius * 0.72),
        bone("right-hand", 9, rightWrist, rightHandEnd, limbRadius * 0.8, limbRadius * 0.55),
        bone("left-thigh", 0, leftHip, leftKnee, limbRadius * 1.55, limbRadius * 1.12),
        bone("left-shin", 11, leftKnee, leftAnkle, limbRadius * 1.12, limbRadius * 0.72),
        bone("left-foot", 12, leftAnkle, [leftAnkle[0], 0.025, height * 0.11], limbRadius * 0.85, limbRadius * 0.58),
        bone("right-thigh", 0, rightHip, rightKnee, limbRadius * 1.55, limbRadius * 1.12),
        bone("right-shin", 14, rightKnee, rightAnkle, limbRadius * 1.12, limbRadius * 0.72),
        bone("right-foot", 15, rightAnkle, [rightAnkle[0], 0.025, height * 0.11], limbRadius * 0.85, limbRadius * 0.58),
        bone("left-shoulder", 1, chest, leftShoulder, height * 0.09, limbRadius * 1.18),
        bone("right-shoulder", 1, chest, rightShoulder, height * 0.09, limbRadius * 1.18),
        bone("left-hip", 0, hips, leftHip, rootRadius * 0.78, limbRadius * 1.55),
        bone("right-hip", 0, hips, rightHip, rootRadius * 0.78, limbRadius * 1.55)
    ];
}
function hexColor(style, role) {
    return style.palette[role] ?? style.palette.skin ?? "#7c9d5d";
}
function attachmentSegments(spec, style, skeleton) {
    const segments = [];
    const blueprint = buildHumanoidBlueprint(spec, style);
    const height = spec.anatomy.heightM;
    const find = (name) => {
        const index = skeleton.findIndex((boneDefinition) => boneDefinition.name === name);
        return { bone: skeleton[index] ?? skeleton[0], index: Math.max(0, index) };
    };
    const push = (name, skinBone, start, end, radiusStart, radiusEnd, role) => {
        segments.push({
            name,
            parent: skinBone,
            skinBone,
            start,
            end,
            radiusStart,
            radiusEnd,
            color: hexColor(style, role)
        });
    };
    const head = find("head");
    const crown = find("head-crown");
    const faceCenter = add(head.bone.end, [0, -height * 0.025, height * 0.075]);
    const profileHeadRadius = height * blueprint.anatomy.headRadius * spec.anatomy.headScale;
    const profileHeadCenter = [
        0,
        head.bone.start[1] + (crown.bone.end[1] - head.bone.start[1]) * 0.48,
        head.bone.start[2] + (crown.bone.end[2] - head.bone.start[2]) * 0.48
    ];
    if (spec.archetype.head === "goblin" || spec.archetype.head === "orc") {
        push("face.left-ear", head.index, add(head.bone.end, [-height * 0.055, 0, 0]), add(head.bone.end, [-height * 0.19, height * 0.035, -height * 0.015]), height * 0.044, 0.003, spec.skin);
        push("face.right-ear", head.index, add(head.bone.end, [height * 0.055, 0, 0]), add(head.bone.end, [height * 0.19, height * 0.035, -height * 0.015]), height * 0.044, 0.003, spec.skin);
    }
    if (spec.archetype.head === "human") {
        push("face.left-inner-ear", head.index, add(profileHeadCenter, [-profileHeadRadius * 1.03, profileHeadRadius * 0.13, profileHeadRadius * 0.02]), add(profileHeadCenter, [-profileHeadRadius * 1.03, -profileHeadRadius * 0.22, profileHeadRadius * 0.05]), profileHeadRadius * 0.105, profileHeadRadius * 0.08, "skinHighlight");
        push("face.right-inner-ear", head.index, add(profileHeadCenter, [profileHeadRadius * 1.03, profileHeadRadius * 0.13, profileHeadRadius * 0.02]), add(profileHeadCenter, [profileHeadRadius * 1.03, -profileHeadRadius * 0.22, profileHeadRadius * 0.05]), profileHeadRadius * 0.105, profileHeadRadius * 0.08, "skinHighlight");
    }
    if (spec.archetype.head !== "skeleton") {
        push("face.nose", head.index, add(faceCenter, [0, height * 0.01, -height * 0.025]), add(faceCenter, [0, -height * 0.012, height * (0.055 + spec.face.nose * 0.025)]), height * 0.026, height * 0.012, spec.skin);
    }
    const eyeSpread = height * blueprint.face.eyeSpread;
    const eyeY = crown.bone.start[1] - height * 0.016;
    const eyeZ = crown.bone.start[2] + height * blueprint.face.eyeFront;
    const eyeRadius = height * blueprint.face.eyeRadius;
    push("face.left-eye-white", head.index, [-eyeSpread, eyeY, eyeZ], [-eyeSpread, eyeY + height * 0.002, eyeZ + height * 0.018], eyeRadius, eyeRadius * 0.72, "eyeWhite");
    push("face.right-eye-white", head.index, [eyeSpread, eyeY, eyeZ], [eyeSpread, eyeY + height * 0.002, eyeZ + height * 0.018], eyeRadius, eyeRadius * 0.72, "eyeWhite");
    if (spec.archetype.head === "human") {
        const noseCenter = add(profileHeadCenter, [
            0,
            profileHeadRadius * blueprint.face.noseVerticalOffset,
            profileHeadRadius * blueprint.face.noseFront
        ]);
        push("face.left-nostril", head.index, add(noseCenter, [-profileHeadRadius * 0.13, -profileHeadRadius * 0.22, profileHeadRadius * 0.34]), add(noseCenter, [-profileHeadRadius * 0.07, -profileHeadRadius * 0.24, profileHeadRadius * 0.36]), profileHeadRadius * 0.035, profileHeadRadius * 0.025, "shadow");
        push("face.right-nostril", head.index, add(noseCenter, [profileHeadRadius * 0.13, -profileHeadRadius * 0.22, profileHeadRadius * 0.34]), add(noseCenter, [profileHeadRadius * 0.07, -profileHeadRadius * 0.24, profileHeadRadius * 0.36]), profileHeadRadius * 0.035, profileHeadRadius * 0.025, "shadow");
    }
    push("face.left-iris", head.index, [-eyeSpread, eyeY, eyeZ + height * 0.025], [-eyeSpread, eyeY, eyeZ + height * 0.033], height * 0.021, height * 0.015, "iris");
    push("face.right-iris", head.index, [eyeSpread, eyeY, eyeZ + height * 0.025], [eyeSpread, eyeY, eyeZ + height * 0.033], height * 0.021, height * 0.015, "iris");
    push("face.left-pupil", head.index, [-eyeSpread, eyeY, eyeZ + height * 0.042], [-eyeSpread, eyeY, eyeZ + height * 0.047], height * 0.009, height * 0.006, "shadow");
    push("face.right-pupil", head.index, [eyeSpread, eyeY, eyeZ + height * 0.042], [eyeSpread, eyeY, eyeZ + height * 0.047], height * 0.009, height * 0.006, "shadow");
    push("face.left-eye-glint", head.index, [-eyeSpread - height * 0.004, eyeY + height * 0.008, eyeZ + height * 0.052], [-eyeSpread - height * 0.004, eyeY + height * 0.009, eyeZ + height * 0.055], height * 0.0045, height * 0.003, "eyeWhite");
    push("face.right-eye-glint", head.index, [eyeSpread - height * 0.004, eyeY + height * 0.008, eyeZ + height * 0.052], [eyeSpread - height * 0.004, eyeY + height * 0.009, eyeZ + height * 0.055], height * 0.0045, height * 0.003, "eyeWhite");
    push("face.left-brow-outer", head.index, [-eyeSpread * 1.5, eyeY + height * 0.03, eyeZ + height * 0.005], [-eyeSpread * 0.92, eyeY + height * 0.041, eyeZ + height * 0.01], height * 0.0075, height * 0.006, "shadow");
    push("face.left-brow-inner", head.index, [-eyeSpread * 0.92, eyeY + height * 0.041, eyeZ + height * 0.01], [-eyeSpread * 0.35, eyeY + height * 0.034, eyeZ + height * 0.014], height * 0.006, height * 0.005, "shadow");
    push("face.right-brow-outer", head.index, [eyeSpread * 1.5, eyeY + height * 0.03, eyeZ + height * 0.005], [eyeSpread * 0.92, eyeY + height * 0.041, eyeZ + height * 0.01], height * 0.0075, height * 0.006, "shadow");
    push("face.right-brow-inner", head.index, [eyeSpread * 0.92, eyeY + height * 0.041, eyeZ + height * 0.01], [eyeSpread * 0.35, eyeY + height * 0.034, eyeZ + height * 0.014], height * 0.006, height * 0.005, "shadow");
    const mouthY = eyeY - height * (spec.archetype.head === "human" ? 0.164 : 0.078);
    const mouthZ = eyeZ + height * (spec.archetype.head === "human" ? 0.043 : 0.006);
    push("face.mouth-left", head.index, [-height * blueprint.face.mouthWidth, mouthY + height * 0.014, mouthZ], [0, mouthY - height * 0.005, mouthZ + height * 0.004], height * 0.016, height * 0.013, "shadow");
    push("face.mouth-right", head.index, [0, mouthY - height * 0.005, mouthZ + height * 0.004], [height * blueprint.face.mouthWidth, mouthY + height * 0.014, mouthZ], height * 0.016, height * 0.013, "shadow");
    if (spec.archetype.head === "goblin" || spec.archetype.head === "orc") {
        push("face.left-tusk", head.index, [-height * 0.035, eyeY - height * 0.073, eyeZ + height * 0.012], [-height * 0.04, eyeY - height * 0.035, eyeZ + height * 0.016], height * 0.009, 0.002, "bone");
        push("face.right-tusk", head.index, [height * 0.035, eyeY - height * 0.073, eyeZ + height * 0.012], [height * 0.04, eyeY - height * 0.035, eyeZ + height * 0.016], height * 0.009, 0.002, "bone");
    }
    else {
        push("face.teeth", head.index, [-height * 0.027, mouthY + height * 0.008, mouthZ + height * 0.015], [height * 0.027, mouthY + height * 0.008, mouthZ + height * 0.015], height * 0.009, height * 0.008, "eyeWhite");
    }
    const facialHair = spec.features?.facialHair;
    if (facialHair !== undefined && facialHair.style !== "none") {
        const moustacheY = eyeY - height * 0.112;
        const moustacheZ = eyeZ + height * 0.032;
        push("face.moustache-left-inner", head.index, [-height * 0.006, moustacheY, moustacheZ], [-height * 0.045, moustacheY - height * 0.01, moustacheZ], height * 0.019, height * 0.014, facialHair.colorRole);
        push("face.moustache-left-curl", head.index, [-height * 0.045, moustacheY - height * 0.01, moustacheZ], [-height * 0.082, moustacheY + height * 0.008, moustacheZ - height * 0.004], height * 0.014, height * 0.008, facialHair.colorRole);
        push("face.moustache-right-inner", head.index, [height * 0.006, moustacheY, moustacheZ], [height * 0.045, moustacheY - height * 0.01, moustacheZ], height * 0.019, height * 0.014, facialHair.colorRole);
        push("face.moustache-right-curl", head.index, [height * 0.045, moustacheY - height * 0.01, moustacheZ], [height * 0.082, moustacheY + height * 0.008, moustacheZ - height * 0.004], height * 0.014, height * 0.008, facialHair.colorRole);
        if (facialHair.style === "beard" || facialHair.style === "goatee") {
            push("face.goatee", head.index, [0, eyeY - height * 0.085, eyeZ + height * 0.025], [0, eyeY - height * 0.16, eyeZ + height * 0.012], height * 0.032, height * 0.008, facialHair.colorRole);
        }
    }
    const hair = spec.features?.hair;
    if (hair !== undefined && hair.style !== "none") {
        push("face.left-sideburn", head.index, add(profileHeadCenter, [-profileHeadRadius * 0.88, -profileHeadRadius * 0.02, profileHeadRadius * 0.2]), add(profileHeadCenter, [-profileHeadRadius * 0.91, -profileHeadRadius * 0.48, profileHeadRadius * 0.2]), profileHeadRadius * 0.12, profileHeadRadius * 0.065, hair.colorRole);
        push("face.right-sideburn", head.index, add(profileHeadCenter, [profileHeadRadius * 0.88, -profileHeadRadius * 0.02, profileHeadRadius * 0.2]), add(profileHeadCenter, [profileHeadRadius * 0.91, -profileHeadRadius * 0.48, profileHeadRadius * 0.2]), profileHeadRadius * 0.12, profileHeadRadius * 0.065, hair.colorRole);
    }
    const headwear = spec.features?.headwear;
    if (headwear?.badge === "star") {
        const badgeCenter = [
            0,
            profileHeadCenter[1] + profileHeadRadius * 0.82,
            profileHeadCenter[2] + profileHeadRadius * 1.045
        ];
        const starPoints = [];
        for (let point = 0; point < 10; point += 1) {
            const angle = -Math.PI / 2 + point * Math.PI / 5;
            const radius = profileHeadRadius * (point % 2 === 0 ? 0.23 : 0.1);
            starPoints.push([
                badgeCenter[0] + Math.cos(angle) * radius,
                badgeCenter[1] + Math.sin(angle) * radius,
                badgeCenter[2]
            ]);
        }
        for (let point = 0; point < starPoints.length; point += 1) {
            push(`headwear.badge-star.${point}`, crown.index, starPoints[point], starPoints[(point + 1) % starPoints.length], profileHeadRadius * 0.018, profileHeadRadius * 0.018, "badgeMark");
        }
    }
    const hips = find("hips");
    const spine = find("spine");
    const primaryClothing = spec.clothing[0];
    if (primaryClothing !== undefined && spec.features?.outfit?.construction !== "overalls") {
        const role = primaryClothing.colorRole;
        push("clothing.upper-layer", spine.index, add(spine.bone.start, [0, height * 0.02, 0]), add(spine.bone.end, [0, -height * 0.03, 0]), spine.bone.radiusStart * 1.18, spine.bone.radiusEnd * 1.08, role);
        if (primaryClothing.type === "robe" || primaryClothing.type === "cape") {
            push("clothing.robe-front", hips.index, add(hips.bone.start, [0, height * 0.055, height * 0.025]), add(hips.bone.start, [0, -height * 0.31, height * 0.055]), height * 0.14, height * 0.21, role);
            push("clothing.robe-back", hips.index, add(hips.bone.start, [0, height * 0.045, -height * 0.035]), add(hips.bone.start, [0, -height * 0.34, -height * 0.075]), height * 0.13, height * 0.23, role);
        }
        push("clothing.belt", hips.index, add(hips.bone.start, [-height * 0.16, height * 0.025, height * 0.01]), add(hips.bone.start, [height * 0.16, height * 0.025, height * 0.01]), height * 0.025, height * 0.025, "leather");
        push("clothing.belt-buckle", hips.index, add(hips.bone.start, [0, height * 0.014, height * 0.105]), add(hips.bone.start, [0, height * 0.05, height * 0.115]), height * 0.032, height * 0.032, "metal");
        const leftWrist = find("left-lower-arm");
        const rightWrist = find("right-lower-arm");
        push("clothing.left-cuff", leftWrist.index, add(leftWrist.bone.end, [0, height * 0.035, 0]), leftWrist.bone.end, height * 0.048, height * 0.046, "leather");
        push("clothing.right-cuff", rightWrist.index, add(rightWrist.bone.end, [0, height * 0.035, 0]), rightWrist.bone.end, height * 0.048, height * 0.046, "leather");
    }
    const outfit = spec.features?.outfit;
    if (outfit?.construction === "overalls") {
        push("clothing.bib-top-seam", spine.index, [-height * 0.115, height * 0.745, height * 0.228], [height * 0.115, height * 0.745, height * 0.228], height * 0.003, height * 0.003, "primaryLight");
        push("clothing.pocket-left", spine.index, [-height * 0.065, height * 0.655, height * 0.232], [-height * 0.065, height * 0.59, height * 0.236], height * 0.003, height * 0.003, "primaryLight");
        push("clothing.pocket-bottom", spine.index, [-height * 0.065, height * 0.59, height * 0.236], [height * 0.065, height * 0.59, height * 0.236], height * 0.003, height * 0.003, "primaryLight");
        push("clothing.pocket-right", spine.index, [height * 0.065, height * 0.59, height * 0.236], [height * 0.065, height * 0.655, height * 0.232], height * 0.003, height * 0.003, "primaryLight");
        push("clothing.left-leg-seam", hips.index, [-height * 0.082, height * 0.41, height * 0.068], [-height * 0.082, height * 0.105, height * 0.068], height * 0.0022, height * 0.0022, "primaryLight");
        push("clothing.right-leg-seam", hips.index, [height * 0.082, height * 0.41, height * 0.068], [height * 0.082, height * 0.105, height * 0.068], height * 0.0022, height * 0.0022, "primaryLight");
    }
    for (const [index, equipment] of spec.equipment.entries()) {
        const handName = equipment.hand === "left" ? "left-hand" : "right-hand";
        const hand = find(handName);
        const anchor = hand.bone.end;
        const radius = height * 0.018 * equipment.scale;
        const role = equipment.material;
        if (equipment.type === "staff") {
            push(`equipment.${index}.staff`, hand.index, add(anchor, [0, -height * 0.48, 0]), add(anchor, [0, height * 0.42, 0]), radius, radius * 0.75, role);
            const staffTop = add(anchor, [0, height * 0.44, 0]);
            push(`equipment.${index}.staff-wrap`, hand.index, add(anchor, [0, -height * 0.06, 0]), add(anchor, [0, height * 0.1, 0]), radius * 1.35, radius * 1.35, "leather");
            push(`equipment.${index}.staff-crystal`, hand.index, staffTop, add(staffTop, [0, height * 0.14, 0]), radius * 3.8, 0.003, "crystal");
            push(`equipment.${index}.staff-prong-left`, hand.index, add(staffTop, [0, -height * 0.025, 0]), add(staffTop, [-height * 0.065, height * 0.09, 0]), radius * 1.25, radius * 0.45, role);
            push(`equipment.${index}.staff-prong-right`, hand.index, add(staffTop, [0, -height * 0.025, 0]), add(staffTop, [height * 0.065, height * 0.09, 0]), radius * 1.25, radius * 0.45, role);
        }
        else if (equipment.type === "sword") {
            push(`equipment.${index}.sword`, hand.index, anchor, add(anchor, [0, -height * 0.42, height * 0.06]), radius * 1.35, radius * 0.32, role);
        }
        else if (equipment.type === "axe") {
            const end = add(anchor, [0, -height * 0.38, 0]);
            push(`equipment.${index}.axe-shaft`, hand.index, anchor, end, radius, radius, role);
            push(`equipment.${index}.axe-head`, hand.index, add(end, [-height * 0.09, 0, 0]), add(end, [height * 0.09, 0, 0]), radius * 2.6, radius * 1.3, "metal");
        }
        else if (equipment.type === "shield") {
            push(`equipment.${index}.shield-v`, hand.index, add(anchor, [0, -height * 0.15, 0]), add(anchor, [0, height * 0.15, 0]), radius * 5, radius * 5, role);
            push(`equipment.${index}.shield-h`, hand.index, add(anchor, [-height * 0.13, 0, 0]), add(anchor, [height * 0.13, 0, 0]), radius * 5, radius * 5, role);
        }
        else {
            push(`equipment.${index}.bow-upper`, hand.index, anchor, add(anchor, [0, height * 0.34, height * 0.08]), radius, radius * 0.7, role);
            push(`equipment.${index}.bow-lower`, hand.index, anchor, add(anchor, [0, -height * 0.34, height * 0.08]), radius, radius * 0.7, role);
        }
    }
    for (const [index, accessory] of spec.accessories.entries()) {
        const anchorName = accessory.anchor === "left-hand" || accessory.anchor === "right-hand"
            ? accessory.anchor
            : accessory.anchor === "head"
                ? "head-crown"
                : accessory.anchor === "waist"
                    ? "hips"
                    : "spine";
        const anchor = find(anchorName);
        const base = accessory.anchor === "head" ? anchor.bone.end : anchor.bone.start;
        const radius = height * 0.012 * accessory.scale;
        if (accessory.type === "horns") {
            push(`accessory.${index}.horn-left`, anchor.index, base, add(base, [-height * 0.08, height * 0.12, 0]), radius * 1.8, 0.002, accessory.material);
            push(`accessory.${index}.horn-right`, anchor.index, base, add(base, [height * 0.08, height * 0.12, 0]), radius * 1.8, 0.002, accessory.material);
        }
        else if (accessory.type === "mask") {
            push(`accessory.${index}.mask`, anchor.index, add(base, [0, -height * 0.1, height * 0.055]), add(base, [0, height * 0.06, height * 0.065]), radius * 4.2, radius * 3.1, accessory.material);
        }
        else if (accessory.type === "bones") {
            push(`accessory.${index}.bones`, anchor.index, add(base, [-height * 0.07, 0, height * 0.145]), add(base, [height * 0.07, -height * 0.11, height * 0.145]), radius * 1.5, radius, accessory.material);
            push(`accessory.${index}.bones-cross`, anchor.index, add(base, [height * 0.07, 0, height * 0.145]), add(base, [-height * 0.07, -height * 0.11, height * 0.145]), radius * 1.5, radius, accessory.material);
        }
        else {
            const side = index % 2 === 0 ? -1 : 1;
            const offsetBase = accessory.type === "pouch"
                ? add(base, [side * height * 0.13, -height * 0.08, height * 0.14])
                : base;
            push(`accessory.${index}.${accessory.type}`, anchor.index, offsetBase, add(offsetBase, [0, height * 0.1 * accessory.scale, height * 0.035]), radius * 2.2, radius * 0.45, accessory.material);
        }
    }
    return segments;
}
function baseSegment(spec, style, boneDefinition, index) {
    const clothed = ["hips", "spine", "left-thigh", "right-thigh"].some((name) => boneDefinition.name === name);
    const clothing = spec.clothing[0];
    const role = clothed && clothing !== undefined ? clothing.colorRole : spec.skin;
    return { ...boneDefinition, skinBone: index, color: hexColor(style, role) };
}
export function generateCharacterGeometry(spec, style) {
    const skeleton = buildSkeleton(spec, style);
    const segments = [
        ...skeleton.map((boneDefinition, index) => baseSegment(spec, style, boneDefinition, index)),
        ...attachmentSegments(spec, style, skeleton)
    ];
    const renderSegments = segments.slice(skeleton.length).filter(({ name }) => !name.startsWith("face.left-ear") &&
        !name.startsWith("face.right-ear") &&
        !name.startsWith("face.nose") &&
        !name.startsWith("clothing.upper-layer") &&
        !name.startsWith("clothing.robe-"));
    const organic = generateOrganicCharacterSurface(spec, style, skeleton);
    const sides = 20;
    const rings = 18;
    const verticesPerBone = sides * rings + 2;
    const organicVertices = organic.positions.length / 3;
    const tubeVertices = renderSegments.length * verticesPerBone;
    const positions = new Float32Array((organicVertices + tubeVertices) * 3);
    const normals = new Float32Array((organicVertices + tubeVertices) * 3);
    const colors = new Float32Array((organicVertices + tubeVertices) * 4);
    const texcoords = new Float32Array((organicVertices + tubeVertices) * 2);
    const joints = new Uint16Array((organicVertices + tubeVertices) * 4);
    const weights = new Float32Array((organicVertices + tubeVertices) * 4);
    const indicesPerTube = (rings - 1) * sides * 6 + sides * 6;
    const indices = new Uint32Array(organic.indices.length + renderSegments.length * indicesPerTube);
    const triangleSurfaces = new Uint8Array(indices.length / 3);
    positions.set(organic.positions);
    normals.set(organic.normals);
    colors.set(organic.colors);
    texcoords.set(organic.texcoords);
    joints.set(organic.joints);
    weights.set(organic.weights);
    indices.set(organic.indices);
    triangleSurfaces.set(organic.surfaces);
    const bounds = {
        min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
    };
    for (let vertex = 0; vertex < organicVertices; vertex += 1) {
        for (let component = 0; component < 3; component += 1) {
            const value = positions[vertex * 3 + component];
            bounds.min[component] = Math.min(bounds.min[component] ?? 0, value);
            bounds.max[component] = Math.max(bounds.max[component] ?? 0, value);
        }
    }
    let indexCursor = organic.indices.length;
    for (let segmentIndex = 0; segmentIndex < renderSegments.length; segmentIndex += 1) {
        const definition = renderSegments[segmentIndex];
        if (definition === undefined)
            continue;
        const surface = definition.name.includes("inner-ear")
            ? SURFACE.skin
            : definition.name.includes("eye") || definition.name.includes("teeth") ||
                definition.name.includes("crystal") || definition.name.includes("buckle")
                ? SURFACE.glossy
                : definition.name.includes("moustache") || definition.name.includes("goatee") ||
                    definition.name.includes("brow") || definition.name.includes("sideburn")
                    ? SURFACE.hair
                    : definition.name.startsWith("clothing.")
                        ? SURFACE.cloth
                        : definition.name.includes("pouch") || definition.name.includes("wrap")
                            ? SURFACE.leather
                            : SURFACE.hard;
        const axis = normalize(subtract(definition.end, definition.start));
        const reference = Math.abs(axis[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
        const tangent = normalize(cross(axis, reference));
        const bitangent = normalize(cross(axis, tangent));
        const vertexBase = organicVertices + segmentIndex * verticesPerBone;
        const colorValue = Number.parseInt(definition.color.slice(1), 16);
        const color = [
            ((colorValue >> 16) & 255) / 255,
            ((colorValue >> 8) & 255) / 255,
            (colorValue & 255) / 255,
            1
        ];
        for (let ring = 0; ring < rings; ring += 1) {
            const along = ring / (rings - 1);
            const center = add(definition.start, scale(subtract(definition.end, definition.start), along));
            const organic = definition.name.includes("head") ? 0.24
                : definition.name.includes("arm") || definition.name.includes("thigh") || definition.name.includes("shin") ? 0.1
                    : definition.name === "spine" || definition.name.includes("upper-layer") ? 0.12
                        : definition.name.includes("robe") ? 0.04
                            : 0;
            const linearRadius = definition.radiusStart + (definition.radiusEnd - definition.radiusStart) * along;
            const radius = linearRadius * (1 + Math.sin(Math.PI * along) * organic);
            for (let side = 0; side < sides; side += 1) {
                const angle = (side / sides) * Math.PI * 2;
                const radial = add(scale(tangent, Math.cos(angle)), scale(bitangent, Math.sin(angle)));
                const position = add(center, scale(radial, radius));
                const vertex = vertexBase + ring * sides + side;
                positions.set(position, vertex * 3);
                normals.set(radial, vertex * 3);
                colors.set(color, vertex * 4);
                texcoords.set([side / sides, along], vertex * 2);
                for (let component = 0; component < 3; component += 1) {
                    bounds.min[component] = Math.min(bounds.min[component] ?? 0, position[component] ?? 0);
                    bounds.max[component] = Math.max(bounds.max[component] ?? 0, position[component] ?? 0);
                }
                const parent = skeleton[definition.skinBone]?.parent ?? -1;
                const parentJoint = parent < 0 ? definition.skinBone : parent;
                joints.set([definition.skinBone, parentJoint, 0, 0], vertex * 4);
                const ownWeight = 1;
                weights.set([ownWeight, 1 - ownWeight, 0, 0], vertex * 4);
            }
        }
        const capStart = vertexBase + sides * rings;
        const capEnd = capStart + 1;
        const capColor = [
            ((colorValue >> 16) & 255) / 255,
            ((colorValue >> 8) & 255) / 255,
            (colorValue & 255) / 255,
            1
        ];
        positions.set(definition.start, capStart * 3);
        positions.set(definition.end, capEnd * 3);
        normals.set(scale(axis, -1), capStart * 3);
        normals.set(axis, capEnd * 3);
        colors.set(capColor, capStart * 4);
        colors.set(capColor, capEnd * 4);
        texcoords.set([0.5, 0], capStart * 2);
        texcoords.set([0.5, 1], capEnd * 2);
        joints.set([definition.skinBone, definition.skinBone, 0, 0], capStart * 4);
        joints.set([definition.skinBone, definition.skinBone, 0, 0], capEnd * 4);
        weights.set([1, 0, 0, 0], capStart * 4);
        weights.set([1, 0, 0, 0], capEnd * 4);
        for (let ring = 0; ring < rings - 1; ring += 1) {
            for (let side = 0; side < sides; side += 1) {
                const nextSide = (side + 1) % sides;
                const lower = vertexBase + ring * sides;
                const upper = lower + sides;
                indices.set([
                    lower + side, upper + side, upper + nextSide,
                    lower + side, upper + nextSide, lower + nextSide
                ], indexCursor);
                indexCursor += 6;
            }
        }
        const lastRing = vertexBase + (rings - 1) * sides;
        for (let side = 0; side < sides; side += 1) {
            const nextSide = (side + 1) % sides;
            indices.set([capStart, vertexBase + nextSide, vertexBase + side], indexCursor);
            indexCursor += 3;
            indices.set([capEnd, lastRing + side, lastRing + nextSide], indexCursor);
            indexCursor += 3;
        }
        const firstTriangle = (organic.indices.length + segmentIndex * indicesPerTube) / 3;
        triangleSurfaces.fill(surface, firstTriangle, firstTriangle + indicesPerTube / 3);
    }
    return {
        skeleton,
        segments,
        positions,
        normals,
        colors,
        texcoords,
        joints,
        weights,
        indices,
        triangleSurfaces,
        bounds,
        qualityMetrics: {
            organicTriangles: organic.indices.length / 3,
            organicVertexRatio: organicVertices / (organicVertices + tubeVertices),
            semanticDetails: renderSegments.filter(({ name }) => name.startsWith("face.") ||
                name.startsWith("clothing.") ||
                name.startsWith("accessory.") ||
                name.startsWith("equipment.")).length
        }
    };
}
