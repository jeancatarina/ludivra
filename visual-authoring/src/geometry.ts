import { createVisualStream } from "./random.js";
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
  texcoords: Float32Array;
  joints: Uint16Array;
  weights: Float32Array;
  indices: Uint32Array;
  bounds: { min: Vector3; max: Vector3 };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: Vector3, factor: number): Vector3 {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function length(value: Vector3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: Vector3): Vector3 {
  const magnitude = length(value);
  if (magnitude <= 1e-9) return [0, 1, 0];
  return scale(value, 1 / magnitude);
}

function bone(
  name: string,
  parent: number,
  start: Vector3,
  end: Vector3,
  radiusStart: number,
  radiusEnd: number
): BoneDefinition {
  return { name, parent, start, end, radiusStart, radiusEnd };
}

export function buildSkeleton(spec: CharacterSpec, style: VisualStyleBible): BoneDefinition[] {
  const stream = createVisualStream(spec.seed, "visual.skeleton");
  const height = spec.anatomy.heightM;
  const asymmetry = style.geometry.asymmetry * 0.025;
  const posture = spec.anatomy.posture * height * 0.045;
  const hipY = height * 0.49;
  const shoulderY = height * 0.77;
  const neckY = height * 0.86;
  const headTop = height;
  const hipHalf = height * 0.085;
  const shoulderHalf = height * 0.16 * spec.anatomy.shoulderScale;
  const upperArm = height * 0.16 * spec.anatomy.armScale;
  const lowerArm = height * 0.15 * spec.anatomy.armScale;
  const thigh = hipY * 0.52 * spec.anatomy.legScale;
  const shin = hipY - thigh;
  const headRadius = height * 0.075 * spec.anatomy.headScale *
    (spec.archetype.head === "goblin" ? 1.12 : spec.archetype.head === "skeleton" ? 0.9 : 1);
  const leftDrift = stream.signed() * asymmetry * height;
  const rightDrift = stream.signed() * asymmetry * height;
  const hips: Vector3 = [0, hipY, 0];
  const chest: Vector3 = [0, shoulderY, posture];
  const neck: Vector3 = [0, neckY, posture * 1.15];
  const head: Vector3 = [0, (neckY + headTop) * 0.5, posture * 1.25];
  const leftShoulder: Vector3 = [-shoulderHalf, shoulderY, posture];
  const rightShoulder: Vector3 = [shoulderHalf, shoulderY, posture];
  const leftElbow: Vector3 = [-shoulderHalf - upperArm * 0.78, shoulderY - upperArm * 0.62, leftDrift];
  const rightElbow: Vector3 = [shoulderHalf + upperArm * 0.78, shoulderY - upperArm * 0.62, rightDrift];
  const leftWrist: Vector3 = [leftElbow[0] - lowerArm * 0.25, leftElbow[1] - lowerArm * 0.97, leftDrift];
  const rightWrist: Vector3 = [rightElbow[0] + lowerArm * 0.25, rightElbow[1] - lowerArm * 0.97, rightDrift];
  const leftHip: Vector3 = [-hipHalf, hipY, 0];
  const rightHip: Vector3 = [hipHalf, hipY, 0];
  const leftKnee: Vector3 = [-hipHalf * 1.12, hipY - thigh, 0.012];
  const rightKnee: Vector3 = [hipHalf * 1.12, hipY - thigh, -0.012];
  const leftAnkle: Vector3 = [-hipHalf, Math.max(0.06, hipY - thigh - shin), 0];
  const rightAnkle: Vector3 = [hipHalf, Math.max(0.06, hipY - thigh - shin), 0];
  const clothingVolume = spec.clothing.some(({ type }) => type === "robe" || type === "light-armor") ? 1.12 : 1;
  const rootRadius = height * 0.105 * clothingVolume;
  const limbRadius = height * (spec.archetype.body === "small-humanoid" ? 0.037 : 0.044);

  return [
    bone("hips", -1, hips, [0, hipY + height * 0.11, posture * 0.35], rootRadius, rootRadius * 0.88),
    bone("spine", 0, [0, hipY + height * 0.11, posture * 0.35], chest, rootRadius * 0.88, height * 0.13),
    bone("neck", 1, chest, neck, height * 0.055, height * 0.045),
    bone("head", 2, neck, head, headRadius * 0.72, headRadius),
    bone("head-crown", 3, head, [0, headTop, posture * 1.28], headRadius, headRadius * 0.62),
    bone("left-upper-arm", 1, leftShoulder, leftElbow, limbRadius * 1.18, limbRadius),
    bone("left-lower-arm", 5, leftElbow, leftWrist, limbRadius, limbRadius * 0.72),
    bone("left-hand", 6, leftWrist, [leftWrist[0] - height * 0.018, leftWrist[1] - height * 0.07, leftWrist[2]], limbRadius * 0.8, limbRadius * 0.55),
    bone("right-upper-arm", 1, rightShoulder, rightElbow, limbRadius * 1.18, limbRadius),
    bone("right-lower-arm", 8, rightElbow, rightWrist, limbRadius, limbRadius * 0.72),
    bone("right-hand", 9, rightWrist, [rightWrist[0] + height * 0.018, rightWrist[1] - height * 0.07, rightWrist[2]], limbRadius * 0.8, limbRadius * 0.55),
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

function hexColor(style: VisualStyleBible, role: string): string {
  return style.palette[role] ?? style.palette.skin ?? "#7c9d5d";
}

function attachmentSegments(
  spec: CharacterSpec,
  style: VisualStyleBible,
  skeleton: BoneDefinition[]
): SurfaceSegment[] {
  const segments: SurfaceSegment[] = [];
  const height = spec.anatomy.heightM;
  const find = (name: string): { bone: BoneDefinition; index: number } => {
    const index = skeleton.findIndex((boneDefinition) => boneDefinition.name === name);
    return { bone: skeleton[index] ?? skeleton[0] as BoneDefinition, index: Math.max(0, index) };
  };
  const push = (
    name: string,
    skinBone: number,
    start: Vector3,
    end: Vector3,
    radiusStart: number,
    radiusEnd: number,
    role: string
  ): void => {
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
  if (spec.archetype.head === "goblin" || spec.archetype.head === "orc") {
    push("face.left-ear", head.index, add(head.bone.end, [-height * 0.055, 0, 0]), add(head.bone.end, [-height * 0.19, height * 0.035, -height * 0.015]), height * 0.044, 0.003, spec.skin);
    push("face.right-ear", head.index, add(head.bone.end, [height * 0.055, 0, 0]), add(head.bone.end, [height * 0.19, height * 0.035, -height * 0.015]), height * 0.044, 0.003, spec.skin);
  }
  if (spec.archetype.head !== "skeleton") {
    push("face.nose", head.index, add(faceCenter, [0, height * 0.01, -height * 0.025]), add(faceCenter, [0, -height * 0.012, height * (0.055 + spec.face.nose * 0.025)]), height * 0.026, height * 0.012, spec.skin);
  }
  const eyeSpread = height * 0.045;
  const eyeY = crown.bone.start[1] - height * 0.016;
  const eyeZ = crown.bone.start[2] + height * 0.085;
  push("face.left-eye", head.index, [-eyeSpread, eyeY, eyeZ], [-eyeSpread, eyeY + height * 0.002, eyeZ + height * 0.012], height * 0.019, height * 0.014, "accent");
  push("face.right-eye", head.index, [eyeSpread, eyeY, eyeZ], [eyeSpread, eyeY + height * 0.002, eyeZ + height * 0.012], height * 0.019, height * 0.014, "accent");
  push("face.left-brow", head.index, [-eyeSpread * 1.5, eyeY + height * 0.035, eyeZ + height * 0.005], [-eyeSpread * 0.35, eyeY + height * 0.024, eyeZ + height * 0.014], height * 0.009, height * 0.006, "shadow");
  push("face.right-brow", head.index, [eyeSpread * 1.5, eyeY + height * 0.035, eyeZ + height * 0.005], [eyeSpread * 0.35, eyeY + height * 0.024, eyeZ + height * 0.014], height * 0.009, height * 0.006, "shadow");
  push("face.mouth", head.index, [-height * 0.042, eyeY - height * 0.078, eyeZ + height * 0.006], [height * 0.042, eyeY - height * 0.078, eyeZ + height * 0.006], height * 0.01, height * 0.01, "shadow");
  if (spec.archetype.head === "goblin" || spec.archetype.head === "orc") {
    push("face.left-tusk", head.index, [-height * 0.035, eyeY - height * 0.073, eyeZ + height * 0.012], [-height * 0.04, eyeY - height * 0.035, eyeZ + height * 0.016], height * 0.009, 0.002, "bone");
    push("face.right-tusk", head.index, [height * 0.035, eyeY - height * 0.073, eyeZ + height * 0.012], [height * 0.04, eyeY - height * 0.035, eyeZ + height * 0.016], height * 0.009, 0.002, "bone");
  }

  const hips = find("hips");
  const spine = find("spine");
  const primaryClothing = spec.clothing[0];
  if (primaryClothing !== undefined) {
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
    } else if (equipment.type === "sword") {
      push(`equipment.${index}.sword`, hand.index, anchor, add(anchor, [0, -height * 0.42, height * 0.06]), radius * 1.35, radius * 0.32, role);
    } else if (equipment.type === "axe") {
      const end = add(anchor, [0, -height * 0.38, 0]);
      push(`equipment.${index}.axe-shaft`, hand.index, anchor, end, radius, radius, role);
      push(`equipment.${index}.axe-head`, hand.index, add(end, [-height * 0.09, 0, 0]), add(end, [height * 0.09, 0, 0]), radius * 2.6, radius * 1.3, "metal");
    } else if (equipment.type === "shield") {
      push(`equipment.${index}.shield-v`, hand.index, add(anchor, [0, -height * 0.15, 0]), add(anchor, [0, height * 0.15, 0]), radius * 5, radius * 5, role);
      push(`equipment.${index}.shield-h`, hand.index, add(anchor, [-height * 0.13, 0, 0]), add(anchor, [height * 0.13, 0, 0]), radius * 5, radius * 5, role);
    } else {
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
    } else if (accessory.type === "mask") {
      push(`accessory.${index}.mask`, anchor.index, add(base, [0, -height * 0.1, height * 0.055]), add(base, [0, height * 0.06, height * 0.065]), radius * 4.2, radius * 3.1, accessory.material);
    } else if (accessory.type === "bones") {
      push(`accessory.${index}.bones`, anchor.index, add(base, [-height * 0.07, 0, height * 0.08]), add(base, [height * 0.07, -height * 0.11, height * 0.08]), radius * 1.5, radius, accessory.material);
      push(`accessory.${index}.bones-cross`, anchor.index, add(base, [height * 0.07, 0, height * 0.08]), add(base, [-height * 0.07, -height * 0.11, height * 0.08]), radius * 1.5, radius, accessory.material);
    } else {
      const side = index % 2 === 0 ? -1 : 1;
      const offsetBase = accessory.type === "pouch"
        ? add(base, [side * height * 0.13, -height * 0.08, height * 0.055])
        : base;
      push(`accessory.${index}.${accessory.type}`, anchor.index, offsetBase, add(offsetBase, [0, height * 0.1 * accessory.scale, height * 0.035]), radius * 2.2, radius * 0.45, accessory.material);
    }
  }
  return segments;
}

function baseSegment(spec: CharacterSpec, style: VisualStyleBible, boneDefinition: BoneDefinition, index: number): SurfaceSegment {
  const clothed = ["hips", "spine", "left-thigh", "right-thigh"].some((name) => boneDefinition.name === name);
  const clothing = spec.clothing[0];
  const role = clothed && clothing !== undefined ? clothing.colorRole : spec.skin;
  return { ...boneDefinition, skinBone: index, color: hexColor(style, role) };
}

export function generateCharacterGeometry(spec: CharacterSpec, style: VisualStyleBible): CharacterGeometry {
  const skeleton = buildSkeleton(spec, style);
  const segments = [
    ...skeleton.map((boneDefinition, index) => baseSegment(spec, style, boneDefinition, index)),
    ...attachmentSegments(spec, style, skeleton)
  ];
  const sides = 24;
  const rings = 24;
  const verticesPerBone = sides * rings + 2;
  const positions = new Float32Array(segments.length * verticesPerBone * 3);
  const normals = new Float32Array(segments.length * verticesPerBone * 3);
  const colors = new Float32Array(segments.length * verticesPerBone * 4);
  const texcoords = new Float32Array(segments.length * verticesPerBone * 2);
  const joints = new Uint16Array(segments.length * verticesPerBone * 4);
  const weights = new Float32Array(segments.length * verticesPerBone * 4);
  const indices = new Uint32Array(segments.length * ((rings - 1) * sides * 6 + sides * 6));
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as Vector3,
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as Vector3
  };
  let indexCursor = 0;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const definition = segments[segmentIndex];
    if (definition === undefined) continue;
    const axis = normalize(subtract(definition.end, definition.start));
    const reference: Vector3 = Math.abs(axis[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
    const tangent = normalize(cross(axis, reference));
    const bitangent = normalize(cross(axis, tangent));
    const vertexBase = segmentIndex * verticesPerBone;
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
        const ownWeight = segmentIndex >= skeleton.length || parent < 0 ? 1 : 0.55 + along * 0.4;
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
  }
  return { skeleton, segments, positions, normals, colors, texcoords, joints, weights, indices, bounds };
}
