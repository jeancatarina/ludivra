import { createHash } from "node:crypto";
import { PNG } from "pngjs";
function parseHexColor(value) {
    const match = /^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(value);
    if (match === null)
        throw new Error(`VISUAL_ALPHA_INVALID: invalid matte color ${value}`);
    return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}
function applyMatte(image, output) {
    const [red, green, blue] = parseHexColor(output.source.matte.color);
    const transparent = output.source.matte.transparentThreshold;
    const opaque = output.source.matte.opaqueThreshold;
    if (opaque <= transparent)
        throw new Error("VISUAL_ALPHA_INVALID: opaqueThreshold must exceed transparentThreshold");
    for (let offset = 0; offset < image.data.length; offset += 4) {
        const dr = image.data[offset] - red;
        const dg = image.data[offset + 1] - green;
        const db = image.data[offset + 2] - blue;
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
        const ramp = Math.max(0, Math.min(1, (distance - transparent) / (opaque - transparent)));
        const matteAlpha = ramp < 0.28 ? 0 : Math.pow((ramp - 0.28) / 0.72, 1.8);
        const magentaExcess = Math.max(0, Math.min(image.data[offset], image.data[offset + 2]) - image.data[offset + 1]);
        const magentaBalance = Math.abs(image.data[offset] - image.data[offset + 2]);
        const spillAlpha = magentaBalance < 150
            ? Math.max(0, Math.min(1, 1 - (magentaExcess - 12) / 40))
            : 1;
        const finalAlpha = matteAlpha * spillAlpha * spillAlpha;
        image.data[offset + 3] = Math.round(image.data[offset + 3] * finalAlpha);
        if (matteAlpha < 1) {
            const neutral = image.data[offset + 1];
            const despill = Math.min(1, (1 - matteAlpha) * 2);
            image.data[offset] = Math.max(0, image.data[offset] - Math.round(magentaExcess * despill));
            image.data[offset + 2] = Math.max(0, image.data[offset + 2] - Math.round(magentaExcess * despill));
        }
    }
    const before = Buffer.from(image.data);
    for (let y = 1; y < image.height - 1; y += 1) {
        for (let x = 1; x < image.width - 1; x += 1) {
            const offset = (y * image.width + x) * 4;
            const alpha = before[offset + 3];
            if (alpha === 0)
                continue;
            let touchesTransparent = false;
            for (let dy = -1; dy <= 1 && !touchesTransparent; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    if (before[((y + dy) * image.width + x + dx) * 4 + 3] === 0) {
                        touchesTransparent = true;
                        break;
                    }
                }
            }
            if (touchesTransparent)
                image.data[offset + 3] = Math.round(alpha * 0.2);
        }
    }
}
function alphaBounds(image, minX = 0, maxX = image.width) {
    let left = maxX;
    let right = minX - 1;
    let top = image.height;
    let bottom = -1;
    for (let y = 0; y < image.height; y += 1) {
        for (let x = minX; x < maxX; x += 1) {
            if (image.data[(y * image.width + x) * 4 + 3] < 8)
                continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }
    return bottom < top ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
function occupiedColumnRuns(image) {
    const occupied = Array.from({ length: image.width }, (_, x) => {
        let count = 0;
        for (let y = 0; y < image.height; y += 1) {
            if (image.data[(y * image.width + x) * 4 + 3] >= 8)
                count += 1;
        }
        return count >= 2;
    });
    const runs = [];
    let start = -1;
    for (let x = 0; x <= occupied.length; x += 1) {
        if (occupied[x] === true && start < 0)
            start = x;
        if (start >= 0 && occupied[x] !== true) {
            runs.push([start, x]);
            start = -1;
        }
    }
    return runs;
}
function opaqueMassHeight(image, bounds) {
    const rows = [];
    let total = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
        let count = 0;
        for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
            if (image.data[(y * image.width + x) * 4 + 3] >= 64)
                count += 1;
        }
        rows.push(count);
        total += count;
    }
    if (total === 0)
        return bounds.height;
    const lowerTarget = total * 0.05;
    const upperTarget = total * 0.95;
    let cumulative = 0;
    let lower = 0;
    let upper = rows.length - 1;
    for (let index = 0; index < rows.length; index += 1) {
        cumulative += rows[index];
        if (cumulative >= lowerTarget) {
            lower = index;
            break;
        }
    }
    cumulative = 0;
    for (let index = 0; index < rows.length; index += 1) {
        cumulative += rows[index];
        if (cumulative >= upperTarget) {
            upper = index;
            break;
        }
    }
    return Math.max(1, upper - lower + 1);
}
function copyFrame(source, target, bounds, targetX, targetY) {
    for (let y = 0; y < bounds.height; y += 1) {
        const sourceStart = ((bounds.y + y) * source.width + bounds.x) * 4;
        const targetStart = ((targetY + y) * target.width + targetX) * 4;
        source.data.copy(target.data, targetStart, sourceStart, sourceStart + bounds.width * 4);
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
                const source = neighbors.find((candidate) => before[candidate + 3] > 0);
                if (source === undefined)
                    continue;
                image.data[offset] = before[source];
                image.data[offset + 1] = before[source + 1];
                image.data[offset + 2] = before[source + 2];
            }
        }
    }
}
function reportStatus(checks) {
    return checks.some(({ status }) => status === "failed") ? "failed" : "passed";
}
export function compileRasterProduction(sourceBytes, output) {
    const source = PNG.sync.read(Buffer.from(sourceBytes));
    applyMatte(source, output);
    const checks = [];
    const minimum = output.requirements.minimumSourceSize;
    const resolutionPassed = Math.min(source.width, source.height) >= minimum;
    checks.push({
        id: "source-resolution",
        status: resolutionPassed ? "passed" : "failed",
        code: resolutionPassed ? undefined : "VISUAL_QUALITY_PROFILE_FAILED",
        message: `${source.width}x${source.height}; minimum short edge ${minimum}px`
    });
    const directions = output.mode === "2.5d" ? output.source.directions ?? [] : [];
    const bounds = [];
    if (output.mode === "2.5d") {
        for (let index = 0; index < directions.length; index += 1) {
            const start = Math.floor(index * source.width / directions.length);
            const end = Math.floor((index + 1) * source.width / directions.length);
            const value = alphaBounds(source, start, end);
            if (value !== null)
                bounds.push(value);
        }
        const isolatedRuns = occupiedColumnRuns(source).length;
        const complete = bounds.length === directions.length && directions.length >= 4;
        checks.push({
            id: "direction-set",
            status: complete ? "passed" : "failed",
            code: complete ? undefined : "VISUAL_DIRECTION_SET_INCOMPLETE",
            message: `${bounds.length} populated directional cells for ${directions.length} directions; ${isolatedRuns} alpha islands`
        });
    }
    else {
        const value = alphaBounds(source);
        if (value !== null)
            bounds.push(value);
    }
    if (bounds.length === 0) {
        throw new Error("VISUAL_ALPHA_INVALID: no opaque character pixels remain after matte removal");
    }
    const heights = bounds.map((value) => opaqueMassHeight(source, value));
    const meanHeight = heights.reduce((sum, value) => sum + value, 0) / heights.length;
    const scaleVariance = Math.max(...heights.map((height) => Math.abs(height - meanHeight) / meanHeight));
    const varianceLimit = output.requirements.maximumScaleVariance ?? 1;
    const consistentScale = scaleVariance <= varianceLimit;
    checks.push({
        id: "scale-consistency",
        status: consistentScale ? "passed" : "failed",
        code: consistentScale ? undefined : "VISUAL_DIRECTION_SCALE_MISMATCH",
        message: `maximum height variance ${(scaleVariance * 100).toFixed(1)}%; limit ${(varianceLimit * 100).toFixed(1)}%`
    });
    const padding = output.requirements.padding;
    const cellWidth = Math.max(...bounds.map(({ width }) => width)) + padding * 2;
    const cellHeight = Math.max(...bounds.map(({ height }) => height)) + padding * 2;
    const atlas = new PNG({ width: cellWidth * bounds.length, height: cellHeight });
    const frames = bounds.map((boundsValue, index) => {
        const x = index * cellWidth + padding + Math.floor((cellWidth - padding * 2 - boundsValue.width) / 2);
        const y = cellHeight - padding - boundsValue.height;
        copyFrame(source, atlas, boundsValue, x, y);
        return {
            id: output.mode === "2.5d" ? `${output.id}.${directions[index] ?? index}` : `${output.id}.idle`,
            direction: output.mode === "2.5d" ? directions[index] : undefined,
            rect: { x: index * cellWidth, y: 0, width: cellWidth, height: cellHeight },
            sourceBounds: boundsValue,
            pivot: output.requirements.pivot
        };
    });
    extrudeTransparentRgb(atlas, output.requirements.edgeExtrusion);
    const opaquePixels = [...atlas.data].filter((_, index) => index % 4 === 3 && atlas.data[index] >= 8).length;
    const coverage = opaquePixels / (atlas.width * atlas.height);
    const coveragePassed = coverage >= 0.08 && coverage <= 0.8;
    checks.push({
        id: "alpha-coverage",
        status: coveragePassed ? "passed" : "failed",
        code: coveragePassed ? undefined : "VISUAL_ALPHA_INVALID",
        message: `${(coverage * 100).toFixed(1)}% opaque atlas coverage`
    });
    checks.push({
        id: "edge-extrusion",
        status: output.requirements.edgeExtrusion >= 1 ? "passed" : "failed",
        code: output.requirements.edgeExtrusion >= 1 ? undefined : "VISUAL_ATLAS_BLEED",
        message: `${output.requirements.edgeExtrusion}px transparent RGB extrusion`
    });
    return {
        atlas: PNG.sync.write(atlas),
        metadata: {
            schemaVersion: 1,
            mode: output.mode,
            profile: output.profile,
            image: { width: atlas.width, height: atlas.height },
            pixelsPerMeter: output.requirements.pixelsPerMeter,
            frames,
            animations: output.animations.map((id) => ({ id, frames: frames.map(({ id: frameId }) => frameId) }))
        },
        report: {
            schemaVersion: 1,
            profile: output.profile,
            quality: output.quality,
            status: reportStatus(checks),
            checks,
            metrics: {
                sourceWidth: source.width,
                sourceHeight: source.height,
                atlasWidth: atlas.width,
                atlasHeight: atlas.height,
                frames: frames.length,
                alphaCoverage: coverage,
                maximumScaleVariance: scaleVariance
            }
        }
    };
}
function embeddedBuffers(gltf, binaryChunk) {
    return (gltf.buffers ?? []).map(({ uri }, index) => {
        if (uri === undefined && index === 0 && binaryChunk !== undefined)
            return binaryChunk;
        if (uri === undefined || !uri.startsWith("data:"))
            throw new Error("VISUAL_3D_DEPENDENCY_MISSING");
        const marker = uri.indexOf(",");
        return Buffer.from(uri.slice(marker + 1), uri.slice(0, marker).includes(";base64") ? "base64" : "utf8");
    });
}
function parseModelBytes(source) {
    const bytes = Buffer.from(source);
    if (bytes.length >= 12 && bytes.readUInt32LE(0) === 0x46546c67) {
        if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
            throw new Error("VISUAL_SPEC_INVALID: invalid GLB header");
        }
        let offset = 12;
        let json = null;
        let binaryChunk;
        while (offset + 8 <= bytes.length) {
            const length = bytes.readUInt32LE(offset);
            const type = bytes.readUInt32LE(offset + 4);
            const chunk = bytes.subarray(offset + 8, offset + 8 + length);
            if (type === 0x4e4f534a)
                json = chunk.toString("utf8").replaceAll(/\0+$/g, "").trim();
            else if (type === 0x004e4942)
                binaryChunk = chunk;
            offset += 8 + length;
        }
        if (json === null)
            throw new Error("VISUAL_SPEC_INVALID: GLB has no JSON chunk");
        return { gltf: JSON.parse(json), ...(binaryChunk === undefined ? {} : { binaryChunk }) };
    }
    return { gltf: JSON.parse(bytes.toString("utf8")) };
}
const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const typeSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessorValues(gltf, buffers, index) {
    const accessor = gltf.accessors?.[index];
    if (accessor === undefined || typeof accessor.bufferView !== "number")
        return [];
    const view = gltf.bufferViews?.[accessor.bufferView];
    if (view === undefined)
        return [];
    const componentType = Number(accessor.componentType);
    const componentSize = componentSizes[componentType];
    const components = typeSizes[String(accessor.type)];
    const count = Number(accessor.count);
    if (componentSize === undefined || components === undefined)
        return [];
    const stride = view.byteStride ?? componentSize * components;
    const base = (view.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
    const data = buffers[view.buffer];
    if (data === undefined)
        return [];
    const values = [];
    for (let item = 0; item < count; item += 1) {
        const row = [];
        for (let component = 0; component < components; component += 1) {
            const offset = base + item * stride + component * componentSize;
            if (componentType === 5121)
                row.push(data.readUInt8(offset));
            else if (componentType === 5123)
                row.push(data.readUInt16LE(offset));
            else if (componentType === 5125)
                row.push(data.readUInt32LE(offset));
            else if (componentType === 5126)
                row.push(data.readFloatLE(offset));
            else if (componentType === 5120)
                row.push(data.readInt8(offset));
            else
                row.push(data.readInt16LE(offset));
        }
        values.push(row);
    }
    return values;
}
function imageDimensions(gltf, buffers) {
    const dimensions = [];
    for (const image of gltf.images ?? []) {
        let bytes = null;
        if (image.uri?.startsWith("data:")) {
            bytes = Buffer.from(image.uri.slice(image.uri.indexOf(",") + 1), "base64");
        }
        else if (image.bufferView !== undefined) {
            const view = gltf.bufferViews?.[image.bufferView];
            const data = view === undefined ? undefined : buffers[view.buffer];
            if (view !== undefined && data !== undefined)
                bytes = data.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
        }
        if (bytes !== null && bytes.subarray(1, 4).toString("ascii") === "PNG") {
            const png = PNG.sync.read(bytes);
            dimensions.push([png.width, png.height]);
        }
    }
    return dimensions;
}
export function inspectProductionGltf(source, output) {
    return inspectProductionGltfBytes(Buffer.from(source, "utf8"), output);
}
export function inspectProductionGltfBytes(source, output) {
    const { gltf, binaryChunk } = parseModelBytes(source);
    const buffers = embeddedBuffers(gltf, binaryChunk);
    const primitives = (gltf.meshes ?? []).flatMap(({ primitives: values }) => values);
    const animationNames = (gltf.animations ?? []).map(({ name }) => name ?? "unnamed");
    const normalizedAnimations = animationNames.map((name) => name.toLowerCase().replaceAll("_", "-"));
    let triangles = 0;
    let invalidValues = 0;
    let invalidWeights = 0;
    let degenerateTriangles = 0;
    let skinnedPrimitives = 0;
    for (const primitive of primitives) {
        const positions = accessorValues(gltf, buffers, primitive.attributes.POSITION ?? -1);
        invalidValues += positions.flat().filter((value) => !Number.isFinite(value)).length;
        const weights = accessorValues(gltf, buffers, primitive.attributes.WEIGHTS_0 ?? -1);
        const joints = accessorValues(gltf, buffers, primitive.attributes.JOINTS_0 ?? -1);
        if (weights.length > 0 && joints.length === weights.length)
            skinnedPrimitives += 1;
        invalidWeights += weights.filter((values) => Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.015).length;
        const indices = primitive.indices === undefined
            ? Array.from({ length: positions.length }, (_, index) => index)
            : accessorValues(gltf, buffers, primitive.indices).flat();
        triangles += Math.floor(indices.length / 3);
        for (let index = 0; index + 2 < indices.length; index += 3) {
            if (indices[index] === indices[index + 1] || indices[index] === indices[index + 2] || indices[index + 1] === indices[index + 2]) {
                degenerateTriangles += 1;
            }
        }
    }
    const textures = imageDimensions(gltf, buffers);
    const checks = [
        {
            id: "rig-and-skin",
            status: (gltf.skins?.length ?? 0) >= 1 && skinnedPrimitives >= 1 ? "passed" : "failed",
            code: (gltf.skins?.length ?? 0) >= 1 && skinnedPrimitives >= 1 ? undefined : "VISUAL_3D_SKIN_MISSING",
            message: `${gltf.skins?.length ?? 0} skins; ${skinnedPrimitives}/${primitives.length} skinned primitives`
        },
        {
            id: "animation-coverage",
            status: animationNames.length >= output.requirements.minimumAnimations &&
                output.requirements.requiredAnimations.every((required) => normalizedAnimations.some((name) => name.includes(required)))
                ? "passed" : "failed",
            code: "VISUAL_3D_ANIMATION_MISSING",
            message: `${animationNames.length} clips: ${animationNames.join(", ")}`
        },
        {
            id: "materials-and-textures",
            status: (gltf.materials?.length ?? 0) >= 1 && textures.length >= 1 &&
                textures.every(([width, height]) => Math.min(width, height) >= output.requirements.minimumTextureSize)
                ? "passed" : "failed",
            code: "VISUAL_QUALITY_PROFILE_FAILED",
            message: `${gltf.materials?.length ?? 0} materials; textures ${textures.map(([width, height]) => `${width}x${height}`).join(", ")}`
        },
        {
            id: "triangle-budget",
            status: triangles <= output.requirements.maximumTriangles && triangles > 0 ? "passed" : "failed",
            code: "VISUAL_TRIANGLE_BUDGET_EXCEEDED",
            message: `${triangles} triangles; maximum ${output.requirements.maximumTriangles}`
        },
        {
            id: "finite-geometry",
            status: invalidValues === 0 && degenerateTriangles === 0 ? "passed" : "failed",
            code: "VISUAL_MESH_DEGENERATE",
            message: `${invalidValues} invalid values; ${degenerateTriangles} degenerate index triangles`
        },
        {
            id: "normalized-weights",
            status: invalidWeights === 0 ? "passed" : "failed",
            code: "VISUAL_SKIN_WEIGHTS_INVALID",
            message: `${invalidWeights} vertices with invalid weight sums`
        }
    ];
    for (const check of checks)
        if (check.status === "passed")
            delete check.code;
    return {
        schemaVersion: 1,
        profile: output.profile,
        quality: output.quality,
        status: reportStatus(checks),
        checks,
        metrics: {
            meshes: gltf.meshes?.length ?? 0,
            primitives: primitives.length,
            skins: gltf.skins?.length ?? 0,
            materials: gltf.materials?.length ?? 0,
            textures: textures.length,
            triangles,
            animations: animationNames,
            invalidWeights,
            invalidValues,
            degenerateTriangles
        }
    };
}
export function productionCacheKey(spec, styleSource, sourceHashes) {
    return createHash("sha256")
        .update(`2\0${JSON.stringify(spec)}\0${styleSource}\0${JSON.stringify(sourceHashes, Object.keys(sourceHashes).sort())}`)
        .digest("hex");
}
