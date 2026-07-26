import type { CharacterGeometry, Vector3 } from "./geometry.js";
import type { AnimationKind, CharacterSpec, VisualStyleBible } from "./spec.js";
import { PNG } from "pngjs";

interface BufferView {
  buffer: 0;
  byteOffset: number;
  byteLength: number;
  target?: 34962 | 34963;
}

interface Accessor {
  bufferView: number;
  byteOffset: 0;
  componentType: 5123 | 5125 | 5126;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";
  min?: number[];
  max?: number[];
  normalized?: boolean;
}

class BinaryBuilder {
  private readonly chunks: Buffer[] = [];
  private byteLength = 0;
  readonly views: BufferView[] = [];
  readonly accessors: Accessor[] = [];

  add(
    array: ArrayBufferView,
    descriptor: Omit<Accessor, "bufferView" | "byteOffset">,
    target?: 34962 | 34963
  ): number {
    const padding = (4 - (this.byteLength % 4)) % 4;
    if (padding > 0) {
      this.chunks.push(Buffer.alloc(padding));
      this.byteLength += padding;
    }
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const view = this.views.length;
    this.views.push({
      buffer: 0,
      byteOffset: this.byteLength,
      byteLength: bytes.length,
      ...(target === undefined ? {} : { target })
    });
    this.chunks.push(bytes);
    this.byteLength += bytes.length;
    const accessor = this.accessors.length;
    this.accessors.push({ bufferView: view, byteOffset: 0, ...descriptor });
    return accessor;
  }

  bytes(): Buffer {
    return Buffer.concat(this.chunks, this.byteLength);
  }
}

function translationMatrix(position: Vector3): number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    -position[0], -position[1], -position[2], 1
  ];
}

function hexToFactor(color: string): [number, number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    1
  ];
}

function animationTarget(kind: AnimationKind, geometry: CharacterGeometry): number {
  const name = kind === "cast" || kind === "attack"
    ? "right-upper-arm"
    : kind === "walk" || kind === "run"
      ? "left-thigh"
      : kind === "death"
        ? "spine"
        : "head";
  const index = geometry.skeleton.findIndex((bone) => bone.name === name);
  return index < 0 ? 0 : index;
}

function animationQuaternions(kind: AnimationKind): Float32Array {
  const amplitude = kind === "idle" ? 0.04
    : kind === "walk" ? 0.28
      : kind === "run" ? 0.48
        : kind === "attack" ? 0.72
          : kind === "cast" ? 0.5
            : kind === "death" ? 1.1
              : 0.2;
  const axis: Vector3 = kind === "death" ? [0, 0, 1] : [1, 0, 0];
  const values = new Float32Array(12);
  for (const [frame, angle] of [0, -amplitude, amplitude].entries()) {
    const half = angle * 0.5;
    const offset = frame * 4;
    values.set([
      axis[0] * Math.sin(half),
      axis[1] * Math.sin(half),
      axis[2] * Math.sin(half),
      Math.cos(half)
    ], offset);
  }
  return values;
}

export interface GltfArtifact {
  json: string;
  binary: Buffer;
  textures: {
    albedo: Buffer;
    normal: Buffer;
    roughness: Buffer;
  };
}

function generatedTexture(
  style: VisualStyleBible,
  kind: "albedo" | "normal" | "roughness",
  size = 512
): Buffer {
  const image = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const weave = Math.sin(x * 0.31) * Math.sin(y * 0.27);
      const grain = Math.sin((x * 17 + y * 31) * 0.071) * 0.5 + Math.sin((x * 7 - y * 13) * 0.113) * 0.5;
      if (kind === "normal") {
        image.data.set([
          Math.round(128 + grain * 9),
          Math.round(128 + weave * 7),
          252,
          255
        ], offset);
      } else if (kind === "roughness") {
        const rough = Math.round(166 + weave * 9 + grain * 7);
        image.data.set([0, rough, 0, 255], offset);
      } else {
        const variation = 0.92 + weave * 0.025 + grain * 0.018;
        image.data.set([
          Math.round(255 * variation),
          Math.round(252 * variation),
          Math.round(246 * variation),
          255
        ], offset);
      }
    }
  }
  return PNG.sync.write(image, { colorType: 6 });
}

export function buildGltf(
  spec: CharacterSpec,
  style: VisualStyleBible,
  geometry: CharacterGeometry
): GltfArtifact {
  const binary = new BinaryBuilder();
  const positionAccessor = binary.add(geometry.positions, {
    componentType: 5126,
    count: geometry.positions.length / 3,
    type: "VEC3",
    min: [...geometry.bounds.min],
    max: [...geometry.bounds.max]
  }, 34962);
  const normalAccessor = binary.add(geometry.normals, {
    componentType: 5126,
    count: geometry.normals.length / 3,
    type: "VEC3"
  }, 34962);
  const colorAccessor = binary.add(geometry.colors, {
    componentType: 5126,
    count: geometry.colors.length / 4,
    type: "VEC4"
  }, 34962);
  const texcoordAccessor = binary.add(geometry.texcoords, {
    componentType: 5126,
    count: geometry.texcoords.length / 2,
    type: "VEC2"
  }, 34962);
  const jointAccessor = binary.add(geometry.joints, {
    componentType: 5123,
    count: geometry.joints.length / 4,
    type: "VEC4"
  }, 34962);
  const weightAccessor = binary.add(geometry.weights, {
    componentType: 5126,
    count: geometry.weights.length / 4,
    type: "VEC4"
  }, 34962);
  const indexAccessor = binary.add(geometry.indices, {
    componentType: 5125,
    count: geometry.indices.length,
    type: "SCALAR",
    min: [0],
    max: [geometry.positions.length / 3 - 1]
  }, 34963);
  const inverseBindMatrices = new Float32Array(geometry.skeleton.length * 16);
  for (let index = 0; index < geometry.skeleton.length; index += 1) {
    inverseBindMatrices.set(translationMatrix(geometry.skeleton[index]?.start ?? [0, 0, 0]), index * 16);
  }
  const inverseBindAccessor = binary.add(inverseBindMatrices, {
    componentType: 5126,
    count: geometry.skeleton.length,
    type: "MAT4"
  });

  const nodes = geometry.skeleton.map((bone, index) => {
    const parentStart = bone.parent < 0 ? [0, 0, 0] as Vector3 : geometry.skeleton[bone.parent]?.start ?? [0, 0, 0];
    const children = geometry.skeleton
      .map((child, childIndex) => ({ child, childIndex }))
      .filter(({ child }) => child.parent === index)
      .map(({ childIndex }) => childIndex);
    return {
      name: bone.name,
      translation: [
        bone.start[0] - parentStart[0],
        bone.start[1] - parentStart[1],
        bone.start[2] - parentStart[2]
      ],
      ...(children.length === 0 ? {} : { children })
    };
  });
  const meshNode = nodes.length;
  nodes.push({ name: spec.id, translation: [0, 0, 0], mesh: 0, skin: 0 } as typeof nodes[number]);

  const animations = spec.animations.map((kind) => {
    const input = binary.add(new Float32Array([0, 0.5, 1]), {
      componentType: 5126,
      count: 3,
      type: "SCALAR",
      min: [0],
      max: [1]
    });
    const output = binary.add(animationQuaternions(kind), {
      componentType: 5126,
      count: 3,
      type: "VEC4"
    });
    return {
      name: kind,
      samplers: [{ input, output, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: animationTarget(kind, geometry), path: "rotation" } }]
    };
  });
  const roughness = Math.min(1, Math.max(0.04, 0.62 + style.roughnessBias * 0.25));
  const textures = {
    albedo: generatedTexture(style, "albedo"),
    normal: generatedTexture(style, "normal"),
    roughness: generatedTexture(style, "roughness")
  };
  const binaryBytes = binary.bytes();
  const gltf = {
    asset: {
      version: "2.0",
      generator: "@ludivra/visual-authoring",
      extras: { visualId: spec.id, style: spec.style, seed: spec.seed }
    },
    scene: 0,
    scenes: [{ nodes: [0, meshNode] }],
    nodes,
    meshes: [{
      name: spec.id,
      primitives: [{
        attributes: {
          POSITION: positionAccessor,
          NORMAL: normalAccessor,
          COLOR_0: colorAccessor,
          TEXCOORD_0: texcoordAccessor,
          JOINTS_0: jointAccessor,
          WEIGHTS_0: weightAccessor
        },
        indices: indexAccessor,
        material: 0,
        mode: 4
      }]
    }],
    skins: [{
      name: `${spec.id}.rig`,
      inverseBindMatrices: inverseBindAccessor,
      skeleton: 0,
      joints: geometry.skeleton.map((_bone, index) => index)
    }],
    materials: [{
      name: `${spec.id}.procedural-base`,
      pbrMetallicRoughness: {
        baseColorFactor: hexToFactor("#ffffff"),
        baseColorTexture: { index: 0 },
        metallicFactor: spec.skin === "metal" ? 0.8 : 0,
        roughnessFactor: roughness,
        metallicRoughnessTexture: { index: 2 }
      },
      normalTexture: { index: 1, scale: 0.35 },
      doubleSided: false,
      extras: {
        mapping: "triplanar",
        layers: ["base-color", "cellular-noise", "curvature-darkening", "joint-warmth"]
      }
    }],
    images: [
      { name: `${spec.id}.albedo`, uri: `data:image/png;base64,${textures.albedo.toString("base64")}` },
      { name: `${spec.id}.normal`, uri: `data:image/png;base64,${textures.normal.toString("base64")}` },
      { name: `${spec.id}.roughness`, uri: `data:image/png;base64,${textures.roughness.toString("base64")}` }
    ],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    textures: [
      { name: `${spec.id}.albedo`, sampler: 0, source: 0 },
      { name: `${spec.id}.normal`, sampler: 0, source: 1 },
      { name: `${spec.id}.roughness`, sampler: 0, source: 2 }
    ],
    animations,
    buffers: [{ uri: `data:application/octet-stream;base64,${binaryBytes.toString("base64")}`, byteLength: binaryBytes.length }],
    bufferViews: binary.views,
    accessors: binary.accessors
  };
  return { json: `${JSON.stringify(gltf, null, 2)}\n`, binary: binaryBytes, textures };
}
