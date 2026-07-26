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
                    metallicFactor: spec.skin === "metal" ? 0.8 : 0,
                    roughnessFactor: roughness
                },
                doubleSided: false,
                extras: {
                    mapping: "triplanar",
                    layers: ["base-color", "cellular-noise", "curvature-darkening", "joint-warmth"]
                }
            }],
        animations,
        buffers: [{ uri: `data:application/octet-stream;base64,${binaryBytes.toString("base64")}`, byteLength: binaryBytes.length }],
        bufferViews: binary.views,
        accessors: binary.accessors
    };
    return { json: `${JSON.stringify(gltf, null, 2)}\n`, binary: binaryBytes };
}
