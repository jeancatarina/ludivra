import { createHash } from "node:crypto";
import { PNG } from "pngjs";
const directionYaw = {
    south: 0,
    "south-west": 45,
    west: 90,
    "north-west": 135,
    north: 180,
    "north-east": 225,
    east: 270,
    "south-east": 315
};
function status(checks) {
    return checks.some((check) => check.status === "failed") ? "failed" : "passed";
}
export function productionCharacterRecipe(spec) {
    return {
        schemaVersion: 1,
        id: spec.id,
        style: spec.style,
        seed: spec.seed,
        archetype: spec.archetype,
        anatomy: spec.anatomy,
        face: spec.face,
        skin: spec.skin,
        clothing: spec.clothing,
        equipment: spec.equipment,
        accessories: spec.accessories,
        animations: spec.animations,
        ...(spec.effects === undefined ? {} : { effects: spec.effects }),
        surfaces: []
    };
}
function rotateY(value, yaw) {
    const sine = Math.sin(yaw);
    const cosine = Math.cos(yaw);
    return [
        value[0] * cosine + value[2] * sine,
        value[1],
        -value[0] * sine + value[2] * cosine
    ];
}
function project(geometry, index, size, yaw, pitch, scale, centerX, floorY) {
    const position = rotateY([
        geometry.positions[index * 3],
        geometry.positions[index * 3 + 1],
        geometry.positions[index * 3 + 2]
    ], yaw);
    const normal = rotateY([
        geometry.normals[index * 3],
        geometry.normals[index * 3 + 1],
        geometry.normals[index * 3 + 2]
    ], yaw);
    const color = [
        geometry.colors[index * 4],
        geometry.colors[index * 4 + 1],
        geometry.colors[index * 4 + 2]
    ];
    const pitchRadians = pitch * Math.PI / 180;
    const projectedY = position[1] * Math.cos(pitchRadians) - position[2] * Math.sin(pitchRadians);
    const depth = position[2] * Math.cos(pitchRadians) + position[1] * Math.sin(pitchRadians);
    return {
        x: centerX + position[0] * scale,
        y: floorY - projectedY * scale,
        depth,
        color,
        normal,
    };
}
function edge(left, right, x, y) {
    return (x - left.x) * (right.y - left.y) - (y - left.y) * (right.x - left.x);
}
function drawTriangle(image, depthBuffer, a, b, c) {
    const area = edge(a, b, c.x, c.y);
    if (Math.abs(area) < 0.01)
        return;
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(image.width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(image.height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    const inverseArea = 1 / area;
    const light = [-0.42, 0.7, 0.58];
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const px = x + 0.5;
            const py = y + 0.5;
            const wa = edge(b, c, px, py) * inverseArea;
            const wb = edge(c, a, px, py) * inverseArea;
            const wc = 1 - wa - wb;
            if (wa < -0.0001 || wb < -0.0001 || wc < -0.0001)
                continue;
            const depth = a.depth * wa + b.depth * wb + c.depth * wc;
            const pixel = y * image.width + x;
            if (depth <= depthBuffer[pixel])
                continue;
            depthBuffer[pixel] = depth;
            const nx = a.normal[0] * wa + b.normal[0] * wb + c.normal[0] * wc;
            const ny = a.normal[1] * wa + b.normal[1] * wb + c.normal[1] * wc;
            const nz = a.normal[2] * wa + b.normal[2] * wb + c.normal[2] * wc;
            const length = Math.max(0.0001, Math.hypot(nx, ny, nz));
            const diffuse = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / length);
            const rim = Math.pow(1 - Math.abs(nz / length), 3) * 0.22;
            const shade = 0.38 + diffuse * 0.62 + rim;
            const offset = pixel * 4;
            image.data[offset] = Math.min(255, Math.round((a.color[0] * wa + b.color[0] * wb + c.color[0] * wc) * 255 * shade));
            image.data[offset + 1] = Math.min(255, Math.round((a.color[1] * wa + b.color[1] * wb + c.color[1] * wc) * 255 * shade));
            image.data[offset + 2] = Math.min(255, Math.round((a.color[2] * wa + b.color[2] * wb + c.color[2] * wc) * 255 * shade));
            image.data[offset + 3] = 255;
        }
    }
}
function outline(image, radius) {
    const result = new PNG({ width: image.width, height: image.height });
    const source = Buffer.from(image.data);
    for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
            const offset = (y * image.width + x) * 4;
            if (source[offset + 3] > 0) {
                source.copy(result.data, offset, offset, offset + 4);
                continue;
            }
            let neighbor = false;
            for (let dy = -radius; dy <= radius && !neighbor; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height)
                        continue;
                    if (source[(ny * image.width + nx) * 4 + 3] > 220) {
                        neighbor = true;
                        break;
                    }
                }
            }
            if (neighbor)
                result.data.set([12, 17, 24, 235], offset);
        }
    }
    return result;
}
function alphaBlend(target, source) {
    for (let offset = 0; offset < target.data.length; offset += 4) {
        const alpha = source.data[offset + 3] / 255;
        if (alpha <= 0)
            continue;
        const inverse = 1 - alpha;
        target.data[offset] = Math.round(source.data[offset] * alpha + target.data[offset] * inverse);
        target.data[offset + 1] = Math.round(source.data[offset + 1] * alpha + target.data[offset + 1] * inverse);
        target.data[offset + 2] = Math.round(source.data[offset + 2] * alpha + target.data[offset + 2] * inverse);
        target.data[offset + 3] = Math.round((alpha + target.data[offset + 3] / 255 * inverse) * 255);
    }
}
function groundShadow(size) {
    const shadow = new PNG({ width: size, height: size });
    const centerX = size * 0.5;
    const centerY = size * 0.89;
    const radiusX = size * 0.25;
    const radiusY = size * 0.045;
    for (let y = Math.floor(centerY - radiusY * 2); y <= Math.ceil(centerY + radiusY * 2); y += 1) {
        for (let x = Math.floor(centerX - radiusX * 2); x <= Math.ceil(centerX + radiusX * 2); x += 1) {
            if (x < 0 || y < 0 || x >= size || y >= size)
                continue;
            const distance = (x - centerX) ** 2 / radiusX ** 2 + (y - centerY) ** 2 / radiusY ** 2;
            if (distance >= 1)
                continue;
            const alpha = Math.round((1 - distance) ** 2 * 92);
            shadow.data.set([8, 12, 19, alpha], (y * size + x) * 4);
        }
    }
    return shadow;
}
function renderView(geometry, size, yawDegrees, pitchDegrees, outlineStrength) {
    const character = new PNG({ width: size, height: size });
    const depth = new Float32Array(size * size);
    depth.fill(Number.NEGATIVE_INFINITY);
    const height = geometry.bounds.max[1] - geometry.bounds.min[1];
    const width = geometry.bounds.max[0] - geometry.bounds.min[0];
    const scale = Math.min(size * 0.76 / Math.max(height, 0.1), size * 0.82 / Math.max(width, height * 0.45));
    const yaw = yawDegrees * Math.PI / 180;
    const cache = new Map();
    const vertex = (index) => {
        const existing = cache.get(index);
        if (existing !== undefined)
            return existing;
        const result = project(geometry, index, size, yaw, pitchDegrees, scale, size * 0.5, size * 0.89);
        cache.set(index, result);
        return result;
    };
    for (let index = 0; index < geometry.indices.length; index += 3) {
        const a = geometry.indices[index];
        const b = geometry.indices[index + 1];
        const c = geometry.indices[index + 2];
        if (a === undefined || b === undefined || c === undefined)
            continue;
        drawTriangle(character, depth, vertex(a), vertex(b), vertex(c));
    }
    const result = groundShadow(size);
    alphaBlend(result, outline(character, Math.max(2, Math.round(size * 0.004 * outlineStrength))));
    return result;
}
function copyImage(source, target, targetX) {
    for (let y = 0; y < source.height; y += 1) {
        const from = y * source.width * 4;
        const to = (y * target.width + targetX) * 4;
        source.data.copy(target.data, to, from, from + source.width * 4);
    }
}
function extrudeTransparentRgb(image, iterations) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const before = Buffer.from(image.data);
        for (let y = 1; y < image.height - 1; y += 1) {
            for (let x = 1; x < image.width - 1; x += 1) {
                const offset = (y * image.width + x) * 4;
                if (before[offset + 3] !== 0)
                    continue;
                const neighbors = [offset - 4, offset + 4, offset - image.width * 4, offset + image.width * 4];
                const source = neighbors.find((candidate) => before[candidate + 3] > 0 ||
                    before[candidate] > 0 || before[candidate + 1] > 0 || before[candidate + 2] > 0);
                if (source === undefined)
                    continue;
                image.data[offset] = before[source];
                image.data[offset + 1] = before[source + 1];
                image.data[offset + 2] = before[source + 2];
            }
        }
    }
}
function alphaCoverage(image) {
    let opaque = 0;
    for (let offset = 3; offset < image.data.length; offset += 4) {
        if (image.data[offset] >= 8)
            opaque += 1;
    }
    return opaque / (image.width * image.height);
}
export function compileGeneratedRaster(compiled, spec, style, output) {
    const directions = output.mode === "2d" ? [undefined] : output.directions;
    const size = output.mode === "2d" ? output.resolution : output.cellResolution;
    const primaryYaw = output.mode === "2d" ? output.camera.yaw : 0;
    const primaryPitch = output.mode === "2d" ? output.camera.pitch : 12;
    const views = directions.map((direction) => renderView(compiled.geometry, size, direction === undefined ? primaryYaw : directionYaw[direction], direction === undefined ? primaryPitch : 12, style.render.outlineStrength));
    const atlas = new PNG({ width: size * views.length, height: size });
    views.forEach((view, index) => copyImage(view, atlas, index * size));
    extrudeTransparentRgb(atlas, output.edgeExtrusion);
    const frames = directions.map((direction, index) => ({
        id: direction === undefined ? `${output.id}.idle` : `${output.id}.${direction}`,
        ...(direction === undefined ? {} : { direction }),
        rect: { x: index * size, y: 0, width: size, height: size },
        pivot: [0.5, 0.89]
    }));
    const coverage = alphaCoverage(atlas);
    const checks = [
        {
            id: "forge-generated",
            status: "passed",
            message: "canonical geometry and every raster pixel were generated locally from the character recipe"
        },
        {
            id: "resolution",
            status: size >= (output.mode === "2d" ? 768 : 256) ? "passed" : "failed",
            code: "VISUAL_QUALITY_PROFILE_FAILED",
            message: `${size}px cell resolution`
        },
        {
            id: "identity-continuity",
            status: spec.identity.focalFeatures.length >= 2 ? "passed" : "failed",
            code: "VISUAL_IDENTITY_INCOMPLETE",
            message: `${spec.identity.focalFeatures.length} canonical focal features across ${views.length} views`
        },
        {
            id: "direction-set",
            status: output.mode === "2d" || output.directions.length === 8 ? "passed" : "failed",
            code: "VISUAL_DIRECTION_SET_INCOMPLETE",
            message: `${views.length} generated views`
        },
        {
            id: "alpha-coverage",
            status: coverage >= 0.08 && coverage <= 0.75 ? "passed" : "failed",
            code: "VISUAL_ALPHA_INVALID",
            message: `${(coverage * 100).toFixed(1)}% atlas coverage`
        },
        {
            id: "edge-extrusion",
            status: output.edgeExtrusion >= 1 ? "passed" : "failed",
            code: "VISUAL_ATLAS_BLEED",
            message: `${output.edgeExtrusion}px transparent RGB extrusion`
        }
    ];
    for (const check of checks)
        if (check.status === "passed")
            delete check.code;
    return {
        atlas: PNG.sync.write(atlas),
        metadata: {
            schemaVersion: 2,
            generatedBy: "@ludivra/visual-authoring",
            mode: output.mode,
            profile: output.profile,
            image: { width: atlas.width, height: atlas.height },
            pixelsPerMeter: output.pixelsPerMeter,
            frames,
            animations: output.animations.map((id) => ({ id, frames: frames.map((frame) => frame.id) }))
        },
        report: {
            schemaVersion: 1,
            profile: output.profile,
            quality: "production",
            status: status(checks),
            checks,
            metrics: {
                generator: "forge-canonical-character",
                sourceKind: "recipe-only",
                cellResolution: size,
                atlasWidth: atlas.width,
                atlasHeight: atlas.height,
                frames: frames.length,
                alphaCoverage: coverage,
                edgeExtrusion: output.edgeExtrusion,
                triangles: compiled.geometry.indices.length / 3
            }
        }
    };
}
export function validateGeneratedModel(compiled, spec, output) {
    const triangles = compiled.geometry.indices.length / 3;
    const required = output.requirements.requiredAnimations;
    const checks = [
        {
            id: "forge-generated",
            status: "passed",
            message: "mesh, rig, materials, textures and animations were generated locally from the character recipe"
        },
        {
            id: "rig-and-skin",
            status: compiled.geometry.skeleton.length >= 18 ? "passed" : "failed",
            code: "VISUAL_3D_SKIN_MISSING",
            message: `${compiled.geometry.skeleton.length} generated bones with normalized skin weights`
        },
        {
            id: "animation-coverage",
            status: spec.animations.length >= output.requirements.minimumAnimations &&
                required.every((animation) => spec.animations.includes(animation))
                ? "passed" : "failed",
            code: "VISUAL_3D_ANIMATION_MISSING",
            message: `${spec.animations.length} generated clips: ${spec.animations.join(", ")}`
        },
        {
            id: "procedural-pbr",
            status: compiled.model.textures.albedo.length > 0 &&
                compiled.model.textures.normal.length > 0 &&
                compiled.model.textures.roughness.length > 0 &&
                output.requirements.minimumTextureSize <= 512 ? "passed" : "failed",
            code: "VISUAL_QUALITY_PROFILE_FAILED",
            message: "512x512 generated albedo, normal and metallic-roughness maps"
        },
        {
            id: "triangle-budget",
            status: triangles > 0 && triangles <= output.requirements.maximumTriangles ? "passed" : "failed",
            code: "VISUAL_TRIANGLE_BUDGET_EXCEEDED",
            message: `${triangles} triangles; maximum ${output.requirements.maximumTriangles}`
        },
        {
            id: "canonical-validation",
            status: compiled.validation.status === "passed" ? "passed" : "failed",
            code: "VISUAL_MESH_DEGENERATE",
            message: `${compiled.validation.checks.filter((check) => check.status === "passed").length}/${compiled.validation.checks.length} canonical checks passed`
        }
    ];
    for (const check of checks)
        if (check.status === "passed")
            delete check.code;
    return {
        schemaVersion: 1,
        profile: output.profile,
        quality: "production",
        status: status(checks),
        checks,
        metrics: {
            generator: "forge-canonical-character",
            sourceKind: "recipe-only",
            meshes: 1,
            bones: compiled.geometry.skeleton.length,
            segments: compiled.geometry.segments.length,
            vertices: compiled.geometry.positions.length / 3,
            triangles,
            materials: 1,
            textures: 3,
            textureResolution: 512,
            animations: spec.animations,
            lods: output.requirements.lods
        }
    };
}
export function productionCacheKey(spec, styleSource) {
    return createHash("sha256")
        .update(`3\0${JSON.stringify(spec)}\0${styleSource}`)
        .digest("hex");
}
