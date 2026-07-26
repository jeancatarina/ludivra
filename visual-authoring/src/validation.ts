import type { CharacterGeometry, Vector3 } from "./geometry.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
import { buildHumanoidBlueprint } from "./blueprint.js";

export interface VisualValidationCheck {
  id: string;
  status: "passed" | "failed";
  code?: string;
  message: string;
  value?: number;
  limit?: number;
}

export interface VisualValidationReport {
  schemaVersion: 1;
  status: "passed" | "failed";
  checks: VisualValidationCheck[];
  metrics: {
    triangles: number;
    vertices: number;
    bones: number;
    weightedVertices: number;
    maxInfluences: number;
    degenerateTriangles: number;
    invalidNormals: number;
    invalidWeights: number;
    feetGroundErrorM: number;
    equipmentReachErrorM: number;
    intersectionRatio: number;
    organicTriangles: number;
    organicVertexRatio: number;
    semanticDetails: number;
    surfaceClasses: number;
    profileModules: number;
    eyeNoseClearanceM: number;
    bounds: { min: Vector3; max: Vector3 };
  };
}

function triangleAreaSquared(geometry: CharacterGeometry, offset: number): number {
  const ia = (geometry.indices[offset] ?? 0) * 3;
  const ib = (geometry.indices[offset + 1] ?? 0) * 3;
  const ic = (geometry.indices[offset + 2] ?? 0) * 3;
  const ax = geometry.positions[ia] ?? 0;
  const ay = geometry.positions[ia + 1] ?? 0;
  const az = geometry.positions[ia + 2] ?? 0;
  const abx = (geometry.positions[ib] ?? 0) - ax;
  const aby = (geometry.positions[ib + 1] ?? 0) - ay;
  const abz = (geometry.positions[ib + 2] ?? 0) - az;
  const acx = (geometry.positions[ic] ?? 0) - ax;
  const acy = (geometry.positions[ic + 1] ?? 0) - ay;
  const acz = (geometry.positions[ic + 2] ?? 0) - az;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return cx * cx + cy * cy + cz * cz;
}

function distance(left: Vector3, right: Vector3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function pointSegmentDistance(point: Vector3, start: Vector3, end: Vector3): number {
  const direction: Vector3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const lengthSquared = direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2;
  if (lengthSquared <= 1e-12) return distance(point, start);
  const offset: Vector3 = [point[0] - start[0], point[1] - start[1], point[2] - start[2]];
  const t = Math.min(1, Math.max(0, (
    offset[0] * direction[0] + offset[1] * direction[1] + offset[2] * direction[2]
  ) / lengthSquared));
  return distance(point, [
    start[0] + direction[0] * t,
    start[1] + direction[1] * t,
    start[2] + direction[2] * t
  ]);
}

function shareEndpoint(
  left: { start: Vector3; end: Vector3 },
  right: { start: Vector3; end: Vector3 }
): boolean {
  return distance(left.start, right.start) < 1e-5 ||
    distance(left.start, right.end) < 1e-5 ||
    distance(left.end, right.start) < 1e-5 ||
    distance(left.end, right.end) < 1e-5;
}

function approximateIntersectionRatio(geometry: CharacterGeometry): number {
  let candidates = 0;
  let intersections = 0;
  for (let leftIndex = 0; leftIndex < geometry.segments.length; leftIndex += 1) {
    const left = geometry.segments[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < geometry.segments.length; rightIndex += 1) {
      const right = geometry.segments[rightIndex];
      if (right === undefined || shareEndpoint(left, right)) continue;
      // Five samples per sweep catch gross non-adjacent overlap without turning
      // validation into a second mesh generator.
      candidates += 1;
      let closest = Number.POSITIVE_INFINITY;
      for (let sample = 0; sample <= 4; sample += 1) {
        const t = sample / 4;
        const point: Vector3 = [
          left.start[0] + (left.end[0] - left.start[0]) * t,
          left.start[1] + (left.end[1] - left.start[1]) * t,
          left.start[2] + (left.end[2] - left.start[2]) * t
        ];
        closest = Math.min(closest, pointSegmentDistance(point, right.start, right.end));
      }
      if (closest < Math.min(left.radiusEnd, right.radiusEnd) * 0.45) intersections += 1;
    }
  }
  return intersections / Math.max(1, candidates);
}

function eyeNoseClearance(
  spec: CharacterSpec,
  geometry: CharacterGeometry,
  blueprint: ReturnType<typeof buildHumanoidBlueprint>
): number {
  if (spec.archetype.head !== "human") return spec.anatomy.heightM;
  const head = geometry.skeleton.find(({ name }) => name === "head");
  const crown = geometry.skeleton.find(({ name }) => name === "head-crown");
  if (head === undefined || crown === undefined) return Number.NEGATIVE_INFINITY;

  const height = spec.anatomy.heightM;
  const headRadius = height * blueprint.anatomy.headRadius * spec.anatomy.headScale;
  const headCenter: Vector3 = [
    0,
    head.start[1] + (crown.end[1] - head.start[1]) * 0.48,
    head.start[2] + (crown.end[2] - head.start[2]) * 0.48
  ];
  const eyeCenter: Vector3 = [
    -height * blueprint.face.eyeSpread,
    crown.start[1] - height * 0.016,
    crown.start[2] + height * blueprint.face.eyeFront
  ];
  const noseCenter: Vector3 = [
    0,
    headCenter[1] + headRadius * blueprint.face.noseVerticalOffset,
    headCenter[2] + headRadius * blueprint.face.noseFront
  ];
  const delta: Vector3 = [
    eyeCenter[0] - noseCenter[0],
    eyeCenter[1] - noseCenter[1],
    eyeCenter[2] - noseCenter[2]
  ];
  const centerDistance = Math.hypot(...delta);
  if (centerDistance <= 1e-9) return Number.NEGATIVE_INFINITY;
  const direction = delta.map((component) => component / centerDistance) as Vector3;
  const noseAxes: Vector3 = [
    headRadius * blueprint.face.noseRadius,
    headRadius * blueprint.face.noseRadius * blueprint.face.noseHeight,
    headRadius * blueprint.face.noseRadius * 0.9
  ];
  const noseSupport = Math.hypot(
    noseAxes[0] * direction[0],
    noseAxes[1] * direction[1],
    noseAxes[2] * direction[2]
  );
  return centerDistance - noseSupport - height * blueprint.face.eyeRadius;
}

export function validateCharacter(
  spec: CharacterSpec,
  style: VisualStyleBible,
  geometry: CharacterGeometry
): VisualValidationReport {
  const blueprint = buildHumanoidBlueprint(spec, style);
  const triangles = geometry.indices.length / 3;
  let degenerateTriangles = 0;
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    if (triangleAreaSquared(geometry, offset) < 1e-16) degenerateTriangles += 1;
  }

  let invalidNormals = 0;
  for (let offset = 0; offset < geometry.normals.length; offset += 3) {
    const magnitude = Math.hypot(
      geometry.normals[offset] ?? Number.NaN,
      geometry.normals[offset + 1] ?? Number.NaN,
      geometry.normals[offset + 2] ?? Number.NaN
    );
    if (!Number.isFinite(magnitude) || Math.abs(magnitude - 1) > 1e-4) invalidNormals += 1;
  }

  let invalidWeights = 0;
  let weightedVertices = 0;
  let maxInfluences = 0;
  for (let offset = 0; offset < geometry.weights.length; offset += 4) {
    let sum = 0;
    let influences = 0;
    for (let component = 0; component < 4; component += 1) {
      const value = geometry.weights[offset + component] ?? Number.NaN;
      sum += value;
      if (value > 0) influences += 1;
    }
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 1e-5 || influences === 0 || influences > 4) invalidWeights += 1;
    else weightedVertices += 1;
    maxInfluences = Math.max(maxInfluences, influences);
  }

  const leftFoot = geometry.skeleton.find(({ name }) => name === "left-foot");
  const rightFoot = geometry.skeleton.find(({ name }) => name === "right-foot");
  const feetGroundErrorM = Math.max(Math.abs(leftFoot?.end[1] ?? 1), Math.abs(rightFoot?.end[1] ?? 1));
  const equipmentReachErrorM = spec.equipment.reduce((maximum, equipment, equipmentIndex) => {
    const hands = equipment.hand === "both"
      ? ["left-hand", "right-hand"]
      : [`${equipment.hand}-hand`];
    for (const handName of hands) {
      const hand = geometry.skeleton.find(({ name }) => name === handName);
      const attachments = geometry.segments.filter(({ name }) => name.startsWith(`equipment.${equipmentIndex}.`));
      if (hand !== undefined && attachments.length > 0) {
        const closest = Math.min(...attachments.map((segment) => pointSegmentDistance(hand.end, segment.start, segment.end)));
        maximum = Math.max(maximum, closest);
      } else {
        maximum = Number.POSITIVE_INFINITY;
      }
    }
    return maximum;
  }, 0);
  const intersectionRatio = approximateIntersectionRatio(geometry);
  const surfaceClasses = new Set(geometry.triangleSurfaces).size;
  const profileModules = blueprint.gates.requiredModules.filter((module) =>
    spec.features?.[module] !== undefined
  ).length;
  const eyeNoseClearanceM = eyeNoseClearance(spec, geometry, blueprint);
  const minimumEyeNoseClearanceM = spec.anatomy.heightM * blueprint.gates.minimumEyeNoseClearance;

  const checks: VisualValidationCheck[] = [
    {
      id: "organic-surface",
      status: geometry.qualityMetrics.organicVertexRatio >= blueprint.gates.minimumOrganicRatio ? "passed" : "failed",
      ...(geometry.qualityMetrics.organicVertexRatio >= blueprint.gates.minimumOrganicRatio
        ? {}
        : { code: "VISUAL_ORGANIC_SURFACE_REQUIRED" }),
      message: `${(geometry.qualityMetrics.organicVertexRatio * 100).toFixed(1)}% of vertices belong to continuous sculpted surfaces`,
      value: geometry.qualityMetrics.organicVertexRatio,
      limit: blueprint.gates.minimumOrganicRatio
    },
    {
      id: "semantic-detail",
      status: geometry.qualityMetrics.semanticDetails >= blueprint.gates.minimumSemanticDetails ? "passed" : "failed",
      ...(geometry.qualityMetrics.semanticDetails >= blueprint.gates.minimumSemanticDetails
        ? {}
        : { code: "VISUAL_SEMANTIC_DETAIL_INCOMPLETE" }),
      message: `${geometry.qualityMetrics.semanticDetails} generated facial, clothing, accessory and equipment details`,
      value: geometry.qualityMetrics.semanticDetails,
      limit: blueprint.gates.minimumSemanticDetails
    },
    {
      id: "material-separation",
      status: surfaceClasses >= blueprint.gates.minimumSurfaceClasses ? "passed" : "failed",
      ...(surfaceClasses >= blueprint.gates.minimumSurfaceClasses
        ? {}
        : { code: "VISUAL_MATERIAL_CLASSES_INCOMPLETE" }),
      message: `${surfaceClasses} semantic PBR surface classes`,
      value: surfaceClasses,
      limit: blueprint.gates.minimumSurfaceClasses
    },
    {
      id: "profile-completeness",
      status: profileModules === blueprint.gates.requiredModules.length ? "passed" : "failed",
      ...(profileModules === blueprint.gates.requiredModules.length
        ? {}
        : { code: "VISUAL_PROFILE_MODULES_INCOMPLETE" }),
      message: `${profileModules}/${blueprint.gates.requiredModules.length} required ${blueprint.profile} modules`,
      value: profileModules,
      limit: blueprint.gates.requiredModules.length
    },
    {
      id: "facial-layout",
      status: eyeNoseClearanceM >= minimumEyeNoseClearanceM ? "passed" : "failed",
      ...(eyeNoseClearanceM >= minimumEyeNoseClearanceM
        ? {}
        : { code: "VISUAL_FACE_FEATURE_COLLISION" }),
      message: `${eyeNoseClearanceM.toFixed(4)}m eye-to-nose surface clearance`,
      value: eyeNoseClearanceM,
      limit: minimumEyeNoseClearanceM
    },
    {
      id: "triangle-budget",
      status: triangles >= style.geometry.triangleBudget.min && triangles <= style.geometry.triangleBudget.max ? "passed" : "failed",
      ...(triangles >= style.geometry.triangleBudget.min && triangles <= style.geometry.triangleBudget.max
        ? {}
        : { code: "VISUAL_TRIANGLE_BUDGET_EXCEEDED" }),
      message: `${triangles} triangles within ${style.geometry.triangleBudget.min}-${style.geometry.triangleBudget.max}`,
      value: triangles,
      limit: style.geometry.triangleBudget.max
    },
    {
      id: "mesh-degenerate",
      status: degenerateTriangles === 0 ? "passed" : "failed",
      ...(degenerateTriangles === 0 ? {} : { code: "VISUAL_MESH_DEGENERATE" }),
      message: `${degenerateTriangles} degenerate triangles`,
      value: degenerateTriangles,
      limit: 0
    },
    {
      id: "normals",
      status: invalidNormals === 0 ? "passed" : "failed",
      ...(invalidNormals === 0 ? {} : { code: "VISUAL_MESH_DEGENERATE" }),
      message: `${invalidNormals} invalid normals`,
      value: invalidNormals,
      limit: 0
    },
    {
      id: "skin-weights",
      status: invalidWeights === 0 && maxInfluences <= 4 ? "passed" : "failed",
      ...(invalidWeights === 0 && maxInfluences <= 4 ? {} : { code: "VISUAL_SKIN_WEIGHTS_INVALID" }),
      message: `${invalidWeights} invalid weights; ${maxInfluences} maximum influences`,
      value: invalidWeights,
      limit: 0
    },
    {
      id: "feet-ground",
      status: feetGroundErrorM <= 0.03 ? "passed" : "failed",
      ...(feetGroundErrorM <= 0.03 ? {} : { code: "VISUAL_SKIN_WEIGHTS_INVALID" }),
      message: `feet are ${feetGroundErrorM.toFixed(4)}m from ground`,
      value: feetGroundErrorM,
      limit: 0.03
    },
    {
      id: "equipment-reach",
      status: equipmentReachErrorM <= 0.001 ? "passed" : "failed",
      ...(equipmentReachErrorM <= 0.001 ? {} : { code: "VISUAL_SKIN_WEIGHTS_INVALID" }),
      message: `equipment anchors are ${equipmentReachErrorM.toFixed(4)}m from hands`,
      value: equipmentReachErrorM,
      limit: 0.001
    },
    {
      id: "self-intersection",
      status: intersectionRatio <= 0.02 ? "passed" : "failed",
      ...(intersectionRatio <= 0.02 ? {} : { code: "VISUAL_INTERSECTION_ABOVE_LIMIT" }),
      message: `${intersectionRatio.toFixed(4)} non-adjacent intersection ratio`,
      value: intersectionRatio,
      limit: 0.02
    }
  ];
  return {
    schemaVersion: 1,
    status: checks.every(({ status }) => status === "passed") ? "passed" : "failed",
    checks,
    metrics: {
      triangles,
      vertices: geometry.positions.length / 3,
      bones: geometry.skeleton.length,
      weightedVertices,
      maxInfluences,
      degenerateTriangles,
      invalidNormals,
      invalidWeights,
      feetGroundErrorM,
      equipmentReachErrorM,
      intersectionRatio,
      organicTriangles: geometry.qualityMetrics.organicTriangles,
      organicVertexRatio: geometry.qualityMetrics.organicVertexRatio,
      semanticDetails: geometry.qualityMetrics.semanticDetails,
      surfaceClasses,
      profileModules,
      eyeNoseClearanceM,
      bounds: geometry.bounds
    }
  };
}
