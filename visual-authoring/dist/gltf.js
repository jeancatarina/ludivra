import { SURFACE, SURFACE_NAMES } from "./geometry.js";
import { PNG } from "pngjs";
class BinaryBuilder {
    chunks = [];
    byteLength = 0;
    views = [];
    accessors = [];
    add(array, descriptor, target) {
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
    bytes() {
        return Buffer.concat(this.chunks, this.byteLength);
    }
}
function translationMatrix(position) {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -position[0], -position[1], -position[2], 1
    ];
}
function hexToFactor(color) {
    const value = Number.parseInt(color.slice(1), 16);
    return [
        ((value >> 16) & 255) / 255,
        ((value >> 8) & 255) / 255,
        (value & 255) / 255,
        1
    ];
}
function animationTarget(kind, geometry) {
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
function animationQuaternions(kind) {
    const amplitude = kind === "idle" ? 0.04
        : kind === "walk" ? 0.28
            : kind === "run" ? 0.48
                : kind === "attack" ? 0.72
                    : kind === "cast" ? 0.5
                        : kind === "death" ? 1.1
                            : 0.2;
    const axis = kind === "death" ? [0, 0, 1] : [1, 0, 0];
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
function generatedTexture(style, kind, surface, size = 512) {
    const image = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const offset = (y * size + x) * 4;
            const weave = Math.sin(x * 0.31) * Math.sin(y * 0.27);
            const grain = Math.sin((x * 17 + y * 31) * 0.071) * 0.5 + Math.sin((x * 7 - y * 13) * 0.113) * 0.5;
            const pores = Math.sin((x * 23 + y * 19) * 0.083) * Math.sin((x * 11 - y * 29) * 0.057);
            const strands = Math.sin(x * 0.13 + y * 0.83) * 0.65 + Math.sin(x * 0.07 + y * 1.61) * 0.35;
            const leather = Math.sin(x * 0.073 + Math.sin(y * 0.11) * 2.2) *
                Math.sin(y * 0.19 + Math.sin(x * 0.047));
            const pattern = surface === SURFACE.skin ? pores * 0.32 + grain * 0.16
                : surface === SURFACE.cloth ? weave * 0.72 + grain * 0.15
                    : surface === SURFACE.leather ? leather * 0.58 + grain * 0.24
                        : surface === SURFACE.hair ? strands * 0.72 + grain * 0.12
                            : surface === SURFACE.glossy ? grain * 0.03
                                : grain * 0.18;
            const normalStrength = surface === SURFACE.cloth ? 18
                : surface === SURFACE.leather ? 13
                    : surface === SURFACE.hair ? 16
                        : surface === SURFACE.skin ? 5
                            : surface === SURFACE.glossy ? 1
                                : 6;
            const roughBase = surface === SURFACE.skin ? 132
                : surface === SURFACE.cloth ? 218
                    : surface === SURFACE.leather ? 158
                        : surface === SURFACE.hair ? 184
                            : surface === SURFACE.glossy ? 48
                                : 112;
            if (kind === "normal") {
                image.data.set([
                    Math.round(128 + pattern * normalStrength),
                    Math.round(128 + (pattern * 0.63 + weave * 0.18) * normalStrength),
                    Math.round(254 - Math.abs(pattern) * 8),
                    255
                ], offset);
            }
            else if (kind === "roughness") {
                const rough = Math.round(roughBase + pattern * 18 + style.roughnessBias * 16);
                image.data.set([0, rough, 0, 255], offset);
            }
            else {
                const amplitude = surface === SURFACE.cloth ? 0.075
                    : surface === SURFACE.leather ? 0.06
                        : surface === SURFACE.hair ? 0.07
                            : surface === SURFACE.skin ? 0.022
                                : surface === SURFACE.glossy ? 0.004
                                    : 0.025;
                const variation = 0.94 + pattern * amplitude;
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
export function buildGltf(spec, style, geometry) {
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
    const indexGroups = SURFACE_NAMES.map(() => []);
    for (let triangle = 0; triangle < geometry.indices.length / 3; triangle += 1) {
        const surface = geometry.triangleSurfaces[triangle] ?? SURFACE.hard;
        const group = indexGroups[surface] ?? indexGroups[SURFACE.hard];
        group.push(geometry.indices[triangle * 3] ?? 0, geometry.indices[triangle * 3 + 1] ?? 0, geometry.indices[triangle * 3 + 2] ?? 0);
    }
    const activeSurfaces = indexGroups
        .map((indices, surface) => ({ indices, surface: surface }))
        .filter(({ indices }) => indices.length > 0)
        .map(({ indices, surface }) => ({
        surface,
        accessor: binary.add(new Uint32Array(indices), {
            componentType: 5125,
            count: indices.length,
            type: "SCALAR",
            min: [indices.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY)],
            max: [indices.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY)]
        }, 34963)
    }));
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
        const parentStart = bone.parent < 0 ? [0, 0, 0] : geometry.skeleton[bone.parent]?.start ?? [0, 0, 0];
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
    nodes.push({ name: spec.id, translation: [0, 0, 0], mesh: 0, skin: 0 });
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
    const materialTextureSets = activeSurfaces.map(({ surface }) => ({
        surface,
        albedo: generatedTexture(style, "albedo", surface),
        normal: generatedTexture(style, "normal", surface),
        roughness: generatedTexture(style, "roughness", surface)
    }));
    const representativeTextures = materialTextureSets.find(({ surface }) => surface === SURFACE.skin) ??
        materialTextureSets[0];
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
                primitives: activeSurfaces.map(({ accessor, surface }, material) => ({
                    attributes: {
                        POSITION: positionAccessor,
                        NORMAL: normalAccessor,
                        COLOR_0: colorAccessor,
                        TEXCOORD_0: texcoordAccessor,
                        JOINTS_0: jointAccessor,
                        WEIGHTS_0: weightAccessor
                    },
                    indices: accessor,
                    material,
                    mode: 4
                }))
            }],
        skins: [{
                name: `${spec.id}.rig`,
                inverseBindMatrices: inverseBindAccessor,
                skeleton: 0,
                joints: geometry.skeleton.map((_bone, index) => index)
            }],
        materials: activeSurfaces.map(({ surface }, material) => ({
            name: `${spec.id}.${SURFACE_NAMES[surface]}`,
            pbrMetallicRoughness: {
                baseColorFactor: hexToFactor("#ffffff"),
                baseColorTexture: { index: material * 3 },
                metallicFactor: surface === SURFACE.hard && spec.skin === "metal" ? 0.8 : 0,
                roughnessFactor: surface === SURFACE.skin ? Math.max(0.3, roughness - 0.2)
                    : surface === SURFACE.cloth ? Math.min(1, roughness + 0.18)
                        : surface === SURFACE.leather ? Math.max(0.36, roughness - 0.08)
                            : surface === SURFACE.glossy ? 0.14
                                : surface === SURFACE.hair ? 0.64
                                    : 0.34,
                metallicRoughnessTexture: { index: material * 3 + 2 }
            },
            normalTexture: {
                index: material * 3 + 1,
                scale: surface === SURFACE.cloth ? 0.42 : surface === SURFACE.leather ? 0.28 : 0.12
            },
            doubleSided: false,
            extras: {
                mapping: "triplanar",
                semanticSurface: SURFACE_NAMES[surface],
                layers: ["base-color", "micro-normal", "curvature-darkening", "contact-occlusion"]
            }
        })),
        images: materialTextureSets.flatMap(({ surface, albedo, normal, roughness: roughnessMap }) => [
            {
                name: `${spec.id}.${SURFACE_NAMES[surface]}.albedo`,
                uri: `data:image/png;base64,${albedo.toString("base64")}`
            },
            {
                name: `${spec.id}.${SURFACE_NAMES[surface]}.normal`,
                uri: `data:image/png;base64,${normal.toString("base64")}`
            },
            {
                name: `${spec.id}.${SURFACE_NAMES[surface]}.roughness`,
                uri: `data:image/png;base64,${roughnessMap.toString("base64")}`
            }
        ]),
        samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
        textures: materialTextureSets.flatMap(({ surface }, material) => [
            { name: `${spec.id}.${SURFACE_NAMES[surface]}.albedo`, sampler: 0, source: material * 3 },
            { name: `${spec.id}.${SURFACE_NAMES[surface]}.normal`, sampler: 0, source: material * 3 + 1 },
            { name: `${spec.id}.${SURFACE_NAMES[surface]}.roughness`, sampler: 0, source: material * 3 + 2 }
        ]),
        animations,
        buffers: [{ uri: `data:application/octet-stream;base64,${binaryBytes.toString("base64")}`, byteLength: binaryBytes.length }],
        bufferViews: binary.views,
        accessors: binary.accessors
    };
    return {
        json: `${JSON.stringify(gltf, null, 2)}\n`,
        binary: binaryBytes,
        textures: {
            albedo: representativeTextures.albedo,
            normal: representativeTextures.normal,
            roughness: representativeTextures.roughness
        }
    };
}
