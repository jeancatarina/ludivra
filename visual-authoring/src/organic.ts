import { SURFACE, type BoneDefinition, type SurfaceClass, type Vector3 } from "./geometry.js";
import { buildHumanoidBlueprint } from "./blueprint.js";
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

type Field = (point: Vector3) => number;

function add(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: Vector3, factor: number): Vector3 {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
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
  const magnitude = Math.max(1e-8, length(value));
  return scale(value, 1 / magnitude);
}

function mix(left: Vector3, right: Vector3, factor: number): Vector3 {
  return add(left, scale(subtract(right, left), factor));
}

function smoothMinimum(left: number, right: number, radius: number): number {
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - blend * blend * radius * 0.25;
}

function union(fields: Field[], smoothing: number): Field {
  return (point) => {
    let distance = fields[0]?.(point) ?? 1;
    for (let index = 1; index < fields.length; index += 1) {
      distance = smoothMinimum(distance, fields[index]!(point), smoothing);
    }
    return distance;
  };
}

function intersection(fields: Field[]): Field {
  return (point) => Math.max(...fields.map((field) => field(point)));
}

function ellipsoid(center: Vector3, radius: Vector3): Field {
  const minimumRadius = Math.min(...radius);
  return (point) => {
    const value = subtract(point, center);
    return (Math.hypot(value[0] / radius[0], value[1] / radius[1], value[2] / radius[2]) - 1) * minimumRadius;
  };
}

function taperedCapsule(start: Vector3, end: Vector3, startRadius: number, endRadius: number): Field {
  const axis = subtract(end, start);
  const denominator = Math.max(1e-8, dot(axis, axis));
  return (point) => {
    const factor = Math.max(0, Math.min(1, dot(subtract(point, start), axis) / denominator));
    const center = mix(start, end, factor);
    const radius = startRadius + (endRadius - startRadius) * factor;
    return length(subtract(point, center)) - radius;
  };
}

function robeField(
  centerX: number,
  topY: number,
  bottomY: number,
  topRadius: number,
  bottomRadius: number,
  topDepth: number,
  bottomDepth: number,
  seed: number
): Field {
  return (point) => {
    const factor = Math.max(0, Math.min(1, (topY - point[1]) / (topY - bottomY)));
    const radius = topRadius + (bottomRadius - topRadius) * factor;
    const depth = topDepth + (bottomDepth - topDepth) * factor;
    const angle = Math.atan2(point[2], point[0] - centerX);
    const folds = Math.sin(angle * 7 + seed * 0.013) * 0.03 * factor;
    const radial = (Math.hypot((point[0] - centerX) / (radius + folds), point[2] / (depth + folds * 0.45)) - 1) *
      Math.min(radius, depth);
    const vertical = point[1] > topY ? point[1] - topY : point[1] < bottomY ? bottomY - point[1] : -0.01;
    return Math.max(radial, vertical);
  };
}

function ellipticalTorus(center: Vector3, radiusX: number, radiusZ: number, thickness: number): Field {
  return (point) => {
    const offset = subtract(point, center);
    const radial = Math.hypot(offset[0] / radiusX, offset[2] / radiusZ);
    return Math.hypot((radial - 1) * Math.min(radiusX, radiusZ), offset[1]) - thickness;
  };
}

function gradient(field: Field, point: Vector3, epsilon: number): Vector3 {
  const x = field([point[0] + epsilon, point[1], point[2]]) - field([point[0] - epsilon, point[1], point[2]]);
  const y = field([point[0], point[1] + epsilon, point[2]]) - field([point[0], point[1] - epsilon, point[2]]);
  const z = field([point[0], point[1], point[2] + epsilon]) - field([point[0], point[1], point[2] - epsilon]);
  return normalize([x, y, z]);
}

function distanceToSegment(point: Vector3, bone: BoneDefinition): number {
  const axis = subtract(bone.end, bone.start);
  const denominator = Math.max(1e-8, dot(axis, axis));
  const factor = Math.max(0, Math.min(1, dot(subtract(point, bone.start), axis) / denominator));
  return length(subtract(point, mix(bone.start, bone.end, factor)));
}

function skinWeights(point: Vector3, skeleton: BoneDefinition[]): { joints: number[]; weights: number[] } {
  const nearest = skeleton
    .map((bone, index) => ({ index, distance: distanceToSegment(point, bone) }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 4);
  const raw = nearest.map(({ distance }) => 1 / Math.max(0.0025, distance * distance));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return {
    joints: nearest.map(({ index }) => index),
    weights: raw.map((value) => value / total)
  };
}

function colorFactor(value: string): [number, number, number, number] {
  const parsed = Number.parseInt(value.slice(1), 16);
  return [
    ((parsed >> 16) & 255) / 255,
    ((parsed >> 8) & 255) / 255,
    (parsed & 255) / 255,
    1
  ];
}

const tetrahedra = [
  [0, 1, 3, 7],
  [0, 3, 2, 7],
  [0, 2, 6, 7],
  [0, 6, 4, 7],
  [0, 4, 5, 7],
  [0, 5, 1, 7]
] as const;

const tetrahedronEdges = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]
] as const;

function polygonize(
  field: Field,
  points: Vector3[],
  values: number[],
  color: [number, number, number, number],
  skeleton: BoneDefinition[],
  characterHeight: number,
  output: OrganicSurface,
  epsilon: number,
  vertexCache: Map<string, number>,
  surface: SurfaceClass
): void {
  const intersections: Vector3[] = [];
  for (const [leftIndex, rightIndex] of tetrahedronEdges) {
    const leftValue = values[leftIndex]!;
    const rightValue = values[rightIndex]!;
    if ((leftValue <= 0) === (rightValue <= 0)) continue;
    const factor = leftValue / (leftValue - rightValue);
    intersections.push(mix(points[leftIndex]!, points[rightIndex]!, factor));
  }
  const unique = intersections.filter((point, index) =>
    intersections.findIndex((candidate) => length(subtract(point, candidate)) < epsilon * 0.08) === index
  );
  if (unique.length < 3) return;
  intersections.splice(0, intersections.length, ...unique);
  const center = scale(intersections.reduce((sum, point) => add(sum, point), [0, 0, 0]), 1 / intersections.length);
  const surfaceNormal = gradient(field, center, epsilon);
  const reference: Vector3 = Math.abs(surfaceNormal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize(cross(surfaceNormal, reference));
  const bitangent = normalize(cross(surfaceNormal, tangent));
  intersections.sort((left, right) => {
    const leftOffset = subtract(left, center);
    const rightOffset = subtract(right, center);
    return Math.atan2(dot(leftOffset, bitangent), dot(leftOffset, tangent)) -
      Math.atan2(dot(rightOffset, bitangent), dot(rightOffset, tangent));
  });

  for (let triangle = 1; triangle + 1 < intersections.length; triangle += 1) {
    let vertices = [intersections[0]!, intersections[triangle]!, intersections[triangle + 1]!] as [Vector3, Vector3, Vector3];
    const faceNormal = cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0]));
    if (length(faceNormal) < epsilon * epsilon * 0.01) continue;
    if (dot(faceNormal, surfaceNormal) < 0) vertices = [vertices[0], vertices[2], vertices[1]];
    for (const vertex of vertices) {
      const key = `${Math.round(vertex[0] * 1e6)},${Math.round(vertex[1] * 1e6)},${Math.round(vertex[2] * 1e6)}:` +
        `${color[0]},${color[1]},${color[2]}`;
      let vertexIndex = vertexCache.get(key);
      if (vertexIndex === undefined) {
        const normal = gradient(field, vertex, epsilon);
        const skin = skinWeights(vertex, skeleton);
        vertexIndex = output.positions.length / 3;
        vertexCache.set(key, vertexIndex);
        output.positions.push(...vertex);
        output.normals.push(...normal);
        output.colors.push(...color);
        output.texcoords.push(
          (Math.atan2(vertex[2], vertex[0]) / (Math.PI * 2) + 1) % 1,
          Math.max(0, Math.min(1, vertex[1] / characterHeight))
        );
        output.joints.push(...skin.joints, ...Array.from({ length: 4 - skin.joints.length }, () => 0));
        output.weights.push(...skin.weights, ...Array.from({ length: 4 - skin.weights.length }, () => 0));
      }
      output.indices.push(vertexIndex);
    }
    output.surfaces.push(surface);
  }
}

function meshField(
  field: Field,
  bounds: { min: Vector3; max: Vector3 },
  resolution: [number, number, number],
  color: [number, number, number, number],
  skeleton: BoneDefinition[],
  characterHeight: number,
  output: OrganicSurface,
  vertexCache: Map<string, number>,
  surface: SurfaceClass
): void {
  const [countX, countY, countZ] = resolution;
  const step: Vector3 = [
    (bounds.max[0] - bounds.min[0]) / (countX - 1),
    (bounds.max[1] - bounds.min[1]) / (countY - 1),
    (bounds.max[2] - bounds.min[2]) / (countZ - 1)
  ];
  const values = new Float32Array(countX * countY * countZ);
  const sample = (x: number, y: number, z: number): number => values[(z * countY + y) * countX + x]!;
  for (let z = 0; z < countZ; z += 1) {
    for (let y = 0; y < countY; y += 1) {
      for (let x = 0; x < countX; x += 1) {
        values[(z * countY + y) * countX + x] = field([
          bounds.min[0] + x * step[0],
          bounds.min[1] + y * step[1],
          bounds.min[2] + z * step[2]
        ]);
      }
    }
  }
  const cornerOffsets = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
  ] as const;
  const epsilon = Math.min(...step) * 0.45;
  for (let z = 0; z < countZ - 1; z += 1) {
    for (let y = 0; y < countY - 1; y += 1) {
      for (let x = 0; x < countX - 1; x += 1) {
        const cubePoints = cornerOffsets.map(([dx, dy, dz]): Vector3 => [
          bounds.min[0] + (x + dx) * step[0],
          bounds.min[1] + (y + dy) * step[1],
          bounds.min[2] + (z + dz) * step[2]
        ]);
        const cubeValues = cornerOffsets.map(([dx, dy, dz]) => sample(x + dx, y + dy, z + dz));
        if (cubeValues.every((value) => value > 0) || cubeValues.every((value) => value <= 0)) continue;
        for (const tetrahedron of tetrahedra) {
          polygonize(
            field,
            tetrahedron.map((index) => cubePoints[index]!),
            tetrahedron.map((index) => cubeValues[index]!),
            color,
            skeleton,
            characterHeight,
            output,
            epsilon,
            vertexCache,
            surface
          );
        }
      }
    }
  }
}

function boneByName(skeleton: BoneDefinition[], name: string): BoneDefinition {
  return skeleton.find((bone) => bone.name === name) ?? skeleton[0]!;
}

export function generateOrganicCharacterSurface(
  spec: CharacterSpec,
  style: VisualStyleBible,
  skeleton: BoneDefinition[]
): OrganicSurface {
  const output: OrganicSurface = {
    positions: [],
    normals: [],
    colors: [],
    texcoords: [],
    joints: [],
    weights: [],
    indices: [],
    surfaces: []
  };
  const vertexCache = new Map<string, number>();
  const blueprint = buildHumanoidBlueprint(spec, style);
  const height = spec.anatomy.heightM;
  const head = boneByName(skeleton, "head");
  const crown = boneByName(skeleton, "head-crown");
  const spine = boneByName(skeleton, "spine");
  const hips = boneByName(skeleton, "hips");
  const headCenter = mix(head.start, crown.end, 0.48);
  const headRadius = height * blueprint.anatomy.headRadius * spec.anatomy.headScale;
  const outfit = spec.features?.outfit;
  const fullCoverageOutfit = outfit?.construction === "overalls";
  const bodyFields: Field[] = [
    ellipsoid(headCenter, [
      headRadius * blueprint.anatomy.headWidth,
      headRadius * blueprint.anatomy.headHeight,
      headRadius * blueprint.anatomy.headDepth
    ]),
    ellipsoid(add(headCenter, [0, -headRadius * 0.58, height * 0.014]), [headRadius * 0.82, headRadius * 0.62, headRadius * 0.8]),
    taperedCapsule(head.start, crown.start, height * 0.052, height * 0.055)
  ];
  if (!fullCoverageOutfit) {
    bodyFields.push(
      ellipsoid(mix(spine.start, spine.end, 0.55), [
        height * blueprint.anatomy.torsoWidth * spec.anatomy.shoulderScale,
        height * blueprint.anatomy.torsoHeight,
        height * blueprint.anatomy.torsoDepth
      ]),
      ellipsoid(mix(hips.start, hips.end, 0.38), [
        height * blueprint.anatomy.hipWidth,
        height * blueprint.anatomy.hipHeight,
        height * blueprint.anatomy.hipDepth
      ])
    );
  }
  if (spec.archetype.head === "human") {
    bodyFields.push(
      ellipsoid(add(headCenter, [0, -headRadius * 0.16, headRadius * 0.82]), [headRadius * 0.44, headRadius * 0.4, headRadius * 0.46]),
      ellipsoid(add(headCenter, [-headRadius * 0.48, -headRadius * 0.32, headRadius * 0.48]), [headRadius * 0.5, headRadius * 0.42, headRadius * 0.34]),
      ellipsoid(add(headCenter, [headRadius * 0.48, -headRadius * 0.32, headRadius * 0.48]), [headRadius * 0.5, headRadius * 0.42, headRadius * 0.34])
    );
  } else {
    bodyFields.push(
      taperedCapsule(
        add(headCenter, [0, -headRadius * 0.15, headRadius * 0.62]),
        add(headCenter, [0, -headRadius * 0.2, headRadius * (1.02 + spec.face.nose * 0.22)]),
        headRadius * 0.24,
        headRadius * 0.08
      )
    );
  }
  if (spec.archetype.head === "goblin" || spec.archetype.head === "orc" || spec.archetype.head === "simple-demon") {
    bodyFields.push(
      taperedCapsule(add(headCenter, [-headRadius * 0.72, headRadius * 0.12, 0]), add(headCenter, [-headRadius * 1.9, headRadius * 0.22, -headRadius * 0.06]), headRadius * 0.42, headRadius * 0.035),
      taperedCapsule(add(headCenter, [headRadius * 0.72, headRadius * 0.12, 0]), add(headCenter, [headRadius * 1.9, headRadius * 0.22, -headRadius * 0.06]), headRadius * 0.42, headRadius * 0.035)
    );
  } else {
    bodyFields.push(
      ellipsoid(add(headCenter, [-headRadius * 0.98, 0, -headRadius * 0.02]), [headRadius * 0.3, headRadius * 0.44, headRadius * 0.22]),
      ellipsoid(add(headCenter, [headRadius * 0.98, 0, -headRadius * 0.02]), [headRadius * 0.3, headRadius * 0.44, headRadius * 0.22])
    );
  }
  if (!fullCoverageOutfit) {
    for (const name of [
      "left-upper-arm", "left-lower-arm", "right-upper-arm", "right-lower-arm",
      "left-thigh", "left-shin", "right-thigh", "right-shin"
    ]) {
      const bone = boneByName(skeleton, name);
      bodyFields.push(taperedCapsule(bone.start, bone.end, bone.radiusStart * 1.08, bone.radiusEnd * 1.08));
    }
  }
  for (const name of ["left-hand", "right-hand"]) {
    const bone = boneByName(skeleton, name);
    bodyFields.push(taperedCapsule(bone.start, bone.end, bone.radiusStart * 1.35, bone.radiusStart * 0.88));
  }
  for (const name of ["left-foot", "right-foot"]) {
    const bone = boneByName(skeleton, name);
    bodyFields.push(taperedCapsule(bone.start, bone.end, bone.radiusStart * 1.7, bone.radiusEnd * 1.45));
  }
  const body = union(bodyFields, height * blueprint.anatomy.organicBlend);
  const extendedPose = spec.features?.presentationPose === "t-pose" || spec.features?.presentationPose === "a-pose";
  meshField(
    body,
    {
      min: [-height * (extendedPose ? 0.76 : 0.42), -height * 0.02, -height * 0.22],
      max: [height * (extendedPose ? 0.76 : 0.42), height * 1.12, height * 0.3]
    },
    [extendedPose ? 54 : 38, 58, 32],
    colorFactor(style.palette[spec.skin] ?? style.palette.skin ?? "#719457"),
    skeleton,
    height,
    output,
    vertexCache,
    SURFACE.skin
  );
  if (spec.archetype.head === "human") {
    const noseCenter = add(headCenter, [
      0,
      headRadius * blueprint.face.noseVerticalOffset,
      headRadius * blueprint.face.noseFront
    ]);
    meshField(
      ellipsoid(noseCenter, [
        headRadius * blueprint.face.noseRadius,
        headRadius * blueprint.face.noseRadius * blueprint.face.noseHeight,
        headRadius * blueprint.face.noseRadius * 0.9
      ]),
      {
        min: subtract(noseCenter, [headRadius * 0.48, headRadius * 0.46, headRadius * 0.4]),
        max: add(noseCenter, [headRadius * 0.48, headRadius * 0.46, headRadius * 0.4])
      },
      [18, 18, 16],
      colorFactor(style.palette.skinHighlight ?? style.palette[spec.skin] ?? style.palette.skin ?? "#e4a083"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.skin
    );
  }

  if (outfit?.construction === "overalls") {
    const shirtFields: Field[] = [
      ellipsoid(mix(spine.start, spine.end, 0.52), [height * 0.158 * spec.anatomy.shoulderScale, height * 0.2, height * 0.115])
    ];
    for (const name of ["left-upper-arm", "left-lower-arm", "right-upper-arm", "right-lower-arm"]) {
      const bone = boneByName(skeleton, name);
      shirtFields.push(taperedCapsule(bone.start, bone.end, bone.radiusStart * 1.2, bone.radiusEnd * 1.17));
    }
    meshField(
      union(shirtFields, height * 0.018),
      {
        min: [-height * (extendedPose ? 0.76 : 0.42), height * 0.43, -height * 0.17],
        max: [height * (extendedPose ? 0.76 : 0.42), height * 0.88, height * 0.19]
      },
      [extendedPose ? 54 : 42, 34, 28],
      colorFactor(style.palette[outfit.secondaryRole] ?? "#c84a32"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.cloth
    );

    const overallHipCenter = add(mix(hips.start, hips.end, 0.42), [0, 0, height * 0.035]);
    const overallFields: Field[] = [
      ellipsoid(overallHipCenter, [height * 0.15, height * 0.16, height * 0.175]),
      ellipsoid(add(overallHipCenter, [0, -height * 0.075, -height * 0.035]), [height * 0.145, height * 0.12, height * 0.145]),
      intersection([
        ellipsoid([0, height * 0.64, height * 0.145], [height * 0.145, height * 0.135, height * 0.078]),
        (point) => height * 0.105 - point[2]
      ])
    ];
    for (const name of ["left-thigh", "left-shin", "right-thigh", "right-shin"]) {
      const bone = boneByName(skeleton, name);
      overallFields.push(taperedCapsule(bone.start, bone.end, bone.radiusStart * 1.42, bone.radiusEnd * 1.34));
    }
    overallFields.push(
      taperedCapsule([-height * 0.09, height * 0.71, height * 0.208], [-height * 0.14, height * 0.82, height * 0.125], height * 0.018, height * 0.015),
      taperedCapsule([height * 0.09, height * 0.71, height * 0.208], [height * 0.14, height * 0.82, height * 0.125], height * 0.018, height * 0.015)
    );
    meshField(
      union(overallFields, height * 0.014),
      {
        min: [-height * 0.23, height * 0.02, -height * 0.15],
        max: [height * 0.23, height * 0.86, height * 0.27]
      },
      [36, 54, 28],
      colorFactor(style.palette[outfit.primaryRole] ?? "#2459b8"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.cloth
    );
    meshField(
      union([
        ellipsoid([-height * 0.09, height * 0.705, height * 0.225], [height * 0.028, height * 0.028, height * 0.014]),
        ellipsoid([height * 0.09, height * 0.705, height * 0.225], [height * 0.028, height * 0.028, height * 0.014])
      ], height * 0.004),
      {
        min: [-height * 0.14, height * 0.66, height * 0.19],
        max: [height * 0.14, height * 0.75, height * 0.26]
      },
      [28, 12, 12],
      colorFactor(style.palette[outfit.trimRole] ?? "#f1b735"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.glossy
    );
  } else {
    const usesRobe = outfit?.construction === "robe" ||
      spec.clothing.some(({ type }) => type === "robe" || type === "cape");
    const usesArmor = outfit?.construction === "armor" ||
      spec.clothing.some(({ type }) => type === "light-armor");
    const clothingFields: Field[] = [
      ellipsoid(
        mix(spine.start, spine.end, 0.5),
        [
          height * (usesArmor ? 0.175 : 0.16) * spec.anatomy.shoulderScale,
          height * 0.205,
          height * (usesArmor ? 0.135 : 0.12)
        ]
      )
    ];
    if (usesRobe) {
      clothingFields.push(robeField(
        style.geometry.asymmetry * height * 0.008,
        hips.end[1] + height * 0.12,
        height * 0.08,
        height * 0.145,
        height * 0.245,
        height * 0.115,
        height * 0.18,
        spec.seed
      ));
    } else {
      clothingFields.push(
        ellipsoid(mix(hips.start, hips.end, 0.48), [
          height * 0.145,
          height * 0.14,
          height * 0.115
        ])
      );
      for (const name of ["left-upper-arm", "right-upper-arm"]) {
        const bone = boneByName(skeleton, name);
        clothingFields.push(taperedCapsule(
          bone.start,
          mix(bone.start, bone.end, usesArmor ? 0.42 : 0.68),
          bone.radiusStart * (usesArmor ? 1.55 : 1.25),
          bone.radiusEnd * (usesArmor ? 1.4 : 1.18)
        ));
      }
    }
    const clothing = union(clothingFields, height * (usesArmor ? 0.012 : 0.018));
    const clothingRole = outfit?.primaryRole ?? spec.clothing[0]?.colorRole ?? "cloth";
    meshField(
      clothing,
      {
        min: [-height * 0.3, height * (usesRobe ? 0.04 : 0.39), -height * 0.23],
        max: [height * 0.3, height * 0.86, height * 0.25]
      },
      [36, 48, 32],
      colorFactor(style.palette[clothingRole] ?? style.palette.cloth ?? "#176b70"),
      skeleton,
      height,
      output,
      vertexCache,
      usesArmor ? SURFACE.hard : SURFACE.cloth
    );

    meshField(
      ellipticalTorus([0, hips.start[1] + height * 0.025, height * 0.006], height * 0.155, height * 0.12, height * 0.022),
      {
        min: [-height * 0.2, hips.start[1] - height * 0.025, -height * 0.15],
        max: [height * 0.2, hips.start[1] + height * 0.075, height * 0.16]
      },
      [28, 12, 24],
      colorFactor(style.palette.leather ?? "#6b472d"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.leather
    );
    meshField(
      ellipticalTorus([0, spine.end[1] + height * 0.015, spine.end[2]], height * 0.118, height * 0.09, height * 0.014),
      {
        min: [-height * 0.15, spine.end[1] - height * 0.025, spine.end[2] - height * 0.12],
        max: [height * 0.15, spine.end[1] + height * 0.055, spine.end[2] + height * 0.12]
      },
      [26, 11, 22],
      colorFactor(style.palette.leather ?? "#6b472d"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.leather
    );
    if (usesRobe) {
      meshField(
        ellipticalTorus([0, height * 0.108, 0], height * 0.238, height * 0.178, height * 0.019),
        {
          min: [-height * 0.27, height * 0.07, -height * 0.21],
          max: [height * 0.27, height * 0.14, height * 0.21]
        },
        [38, 13, 30],
        colorFactor(style.palette[outfit?.trimRole ?? "accent"] ?? style.palette.bone ?? "#d2c7a5"),
        skeleton,
        height,
        output,
        vertexCache,
        SURFACE.hard
      );
    }
  }

  const hair = spec.features?.hair;
  if (hair !== undefined && hair.style !== "none") {
    const hairField = intersection([
      ellipsoid(add(headCenter, [0, headRadius * 0.18, -headRadius * 0.12]), [headRadius * 1.13, headRadius * 1.05, headRadius * 1.02]),
      (point) => headCenter[1] - headRadius * 0.16 - point[1]
    ]);
    meshField(
      hairField,
      {
        min: [headCenter[0] - headRadius * 1.25, headCenter[1] - headRadius * 0.28, headCenter[2] - headRadius * 1.2],
        max: [headCenter[0] + headRadius * 1.25, headCenter[1] + headRadius * 1.3, headCenter[2] + headRadius * 1.05]
      },
      [30, 30, 28],
      colorFactor(style.palette[hair.colorRole] ?? "#493126"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.hair
    );
  }

  const headwear = spec.features?.headwear;
  if (headwear !== undefined) {
    const crownField = intersection([
      ellipsoid(add(headCenter, [0, headRadius * 0.58, -headRadius * 0.06]), [headRadius * 1.16, headRadius * 0.92, headRadius * 1.06]),
      (point) => headCenter[1] - headRadius * 0.02 - point[1]
    ]);
    const brim = ellipsoid(add(headCenter, [0, headRadius * 0.44, headRadius * 0.92]), [headRadius * 1.2, headRadius * 0.16, headRadius * 0.56]);
    meshField(
      union([crownField, brim], headRadius * 0.08),
      {
        min: [headCenter[0] - headRadius * 1.3, headCenter[1] - headRadius * 0.08, headCenter[2] - headRadius * 1.2],
        max: [headCenter[0] + headRadius * 1.3, headCenter[1] + headRadius * 1.58, headCenter[2] + headRadius * 1.55]
      },
      [30, 30, 30],
      colorFactor(style.palette[headwear.primaryRole] ?? "#2b8f86"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.cloth
    );
    if (headwear.badge !== "none") {
      meshField(
        ellipsoid(add(headCenter, [0, headRadius * 0.82, headRadius * 0.95]), [headRadius * 0.34, headRadius * 0.38, headRadius * 0.08]),
        {
          min: [-headRadius * 0.42, headCenter[1] + headRadius * 0.38, headCenter[2] + headRadius * 0.82],
          max: [headRadius * 0.42, headCenter[1] + headRadius * 1.25, headCenter[2] + headRadius * 1.12]
        },
        [18, 18, 10],
        colorFactor(style.palette[headwear.secondaryRole] ?? "#f2d15d"),
        skeleton,
        height,
        output,
        vertexCache,
        SURFACE.glossy
      );
    }
  }

  const hands = spec.features?.hands;
  if (hands !== undefined) {
    for (const name of ["left-hand", "right-hand"]) {
      const gloveFields: Field[] = [];
      const bone = boneByName(skeleton, name);
      const direction = normalize(subtract(bone.end, bone.start));
      const side = direction[0] < 0 ? -1 : 1;
      const palmCenter = add(mix(bone.start, bone.end, 0.54), scale(direction, height * 0.014));
      gloveFields.push(ellipsoid(
        palmCenter,
        [
          height * blueprint.hands.palmLength,
          height * blueprint.hands.palmWidth,
          height * blueprint.hands.palmDepth
        ]
      ));
      if (hands.style === "gloves") {
        gloveFields.push(ellipsoid(
          bone.start,
          [height * 0.032, height * 0.052, height * 0.052]
        ));
      }
      gloveFields.push(taperedCapsule(
        add(bone.start, scale(direction, -height * 0.012)),
        mix(bone.start, bone.end, 0.38),
        bone.radiusStart * 1.4,
        bone.radiusStart * 1.55
      ));
      for (const spread of [-1, 0, 1]) {
        const base = add(mix(bone.start, bone.end, 0.58), [0, spread * height * 0.018, height * 0.002]);
        const tip = add(add(bone.end, scale(direction, height * (
          blueprint.hands.fingerLength + (1 - Math.abs(spread)) * 0.004
        ))), [
          0,
          spread * height * blueprint.hands.fingerSpread,
          -Math.abs(spread) * height * 0.002
        ]);
        gloveFields.push(taperedCapsule(
          base,
          tip,
          height * blueprint.hands.fingerRadius,
          height * blueprint.hands.fingerRadius * 0.78
        ));
      }
      gloveFields.push(taperedCapsule(
        add(mix(bone.start, bone.end, 0.35), [0, -height * 0.025, height * 0.018]),
        add(mix(bone.start, bone.end, 0.78), [side * height * 0.012, -height * 0.064, height * 0.025]),
        height * 0.021,
        height * 0.014
      ));
      const padding: Vector3 = [height * 0.085, height * 0.105, height * 0.085];
      const handResolution: [number, number, number] = blueprint.profile === "hero-mascot"
        ? [32, 30, 26]
        : blueprint.profile === "stylized-hero"
          ? [24, 24, 20]
          : [16, 16, 14];
      meshField(
        union(gloveFields, height * 0.0045),
        {
          min: [
            Math.min(bone.start[0], bone.end[0]) - padding[0],
            Math.min(bone.start[1], bone.end[1]) - padding[1],
            Math.min(bone.start[2], bone.end[2]) - padding[2]
          ],
          max: [
            Math.max(bone.start[0], bone.end[0]) + padding[0],
            Math.max(bone.start[1], bone.end[1]) + padding[1],
            Math.max(bone.start[2], bone.end[2]) + padding[2]
          ]
        },
        handResolution,
        colorFactor(style.palette[hands.colorRole] ?? style.palette[spec.skin] ?? "#f5eee2"),
        skeleton,
        height,
        output,
        vertexCache,
        hands.style === "gloves" ? SURFACE.cloth : SURFACE.skin
      );
    }
  }

  const footwear = spec.features?.footwear;
  if (footwear !== undefined && footwear.style !== "bare") {
    const shoeFields: Field[] = [];
    const soleFields: Field[] = [];
    for (const name of ["left-foot", "right-foot"]) {
      const bone = boneByName(skeleton, name);
      const center = add(mix(bone.start, bone.end, 0.58), [0, height * 0.008, height * 0.018]);
      shoeFields.push(intersection([
        ellipsoid(center, [
          height * blueprint.footwear.width,
          height * blueprint.footwear.height,
          height * blueprint.footwear.length
        ]),
        (point) => -height * 0.008 - point[1]
      ]));
      shoeFields.push(taperedCapsule(
        add(bone.start, [0, height * 0.012, 0]),
        add(mix(bone.start, bone.end, 0.34), [0, height * 0.012, 0]),
        height * 0.062,
        height * 0.057
      ));
      soleFields.push(intersection([
        ellipsoid([center[0], 0, center[2] + height * 0.002], [
          height * blueprint.footwear.width * 0.98,
          height * 0.009,
          height * blueprint.footwear.length * 0.98
        ]),
        (point) => -height * 0.009 - point[1]
      ]));
    }
    meshField(
      union(shoeFields, height * 0.008),
      {
        min: [-height * 0.22, -height * 0.01, -height * 0.08],
        max: [height * 0.22, height * 0.18, height * 0.23]
      },
      [34, 18, 30],
      colorFactor(style.palette[footwear.colorRole] ?? "#6a3828"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.leather
    );
    meshField(
      union(soleFields, height * 0.003),
      {
        min: [-height * 0.22, -height * 0.012, -height * 0.08],
        max: [height * 0.22, height * 0.07, height * 0.24]
      },
      [34, 12, 30],
      colorFactor(style.palette.sole ?? style.palette[footwear.colorRole] ?? "#4f2b22"),
      skeleton,
      height,
      output,
      vertexCache,
      SURFACE.leather
    );
  }
  return output;
}
