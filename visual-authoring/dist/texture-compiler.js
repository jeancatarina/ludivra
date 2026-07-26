import { createHash } from "node:crypto";
import { PNG } from "pngjs";
function hash(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
function encoded(width, height, data) {
    const image = new PNG({ width, height });
    image.data = data;
    const bytes = PNG.sync.write(image, { colorType: 6, inputColorType: 6 });
    return { bytes, sha256: hash(bytes) };
}
function luminance(data, pixel) {
    const offset = pixel * 4;
    return ((data[offset] ?? 0) * 0.2126 + (data[offset + 1] ?? 0) * 0.7152 + (data[offset + 2] ?? 0) * 0.0722) / 255;
}
function sample(data, width, height, x, y) {
    const wrappedX = (x + width) % width;
    const wrappedY = (y + height) % height;
    return luminance(data, wrappedY * width + wrappedX);
}
function edgeDelta(data, width, height) {
    let total = 0;
    let samples = 0;
    for (let y = 0; y < height; y += 1) {
        total += Math.abs(sample(data, width, height, 0, y) - sample(data, width, height, width - 1, y));
        samples += 1;
    }
    for (let x = 0; x < width; x += 1) {
        total += Math.abs(sample(data, width, height, x, 0) - sample(data, width, height, x, height - 1));
        samples += 1;
    }
    return total / Math.max(1, samples);
}
export function compileTexture(input, request, style) {
    let decoded;
    try {
        decoded = PNG.sync.read(Buffer.from(input));
    }
    catch {
        throw new Error("VISUAL_TEXTURE_REQUEST_UNFULFILLED");
    }
    if (decoded.width !== request.resolution || decoded.height !== request.resolution) {
        throw new Error("VISUAL_TEXTURE_REQUEST_UNFULFILLED");
    }
    const { width, height, data } = decoded;
    const albedo = Buffer.alloc(data.length);
    const normal = Buffer.alloc(data.length);
    const roughness = Buffer.alloc(data.length);
    const detailMask = Buffer.alloc(data.length);
    const decalLike = request.kind === "decal" || request.kind === "mask";
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const pixel = y * width + x;
            const offset = pixel * 4;
            const light = luminance(data, pixel);
            const average = (sample(data, width, height, x - 1, y) +
                sample(data, width, height, x + 1, y) +
                sample(data, width, height, x, y - 1) +
                sample(data, width, height, x, y + 1)) / 4;
            const dx = sample(data, width, height, x + 1, y) - sample(data, width, height, x - 1, y);
            const dy = sample(data, width, height, x, y + 1) - sample(data, width, height, x, y - 1);
            const length = Math.hypot(-dx * 2.2, -dy * 2.2, 1);
            const alpha = decalLike ? Math.round(light * 255) : 255;
            const detail = Math.min(1, Math.abs(light - average) * 6);
            const rough = Math.min(1, Math.max(0, 0.58 + style.roughnessBias * 0.3 + (0.5 - detail) * 0.18));
            albedo.set([
                data[offset] ?? 0,
                data[offset + 1] ?? 0,
                data[offset + 2] ?? 0,
                alpha
            ], offset);
            normal.set([
                Math.round(((-dx * 2.2 / length) * 0.5 + 0.5) * 255),
                Math.round(((-dy * 2.2 / length) * 0.5 + 0.5) * 255),
                Math.round(((1 / length) * 0.5 + 0.5) * 255),
                alpha
            ], offset);
            roughness.set([Math.round(rough * 255), Math.round(rough * 255), Math.round(rough * 255), alpha], offset);
            detailMask.set([Math.round(detail * 255), Math.round(detail * 255), Math.round(detail * 255), alpha], offset);
        }
    }
    const seam = edgeDelta(data, width, height);
    const issues = request.requirements?.tileable === true && seam > 0.12
        ? [{ code: "VISUAL_TEXTURE_NOT_TILEABLE", message: `Opposite-edge color delta ${seam.toFixed(4)} exceeds 0.12` }]
        : [];
    return {
        width,
        height,
        edgeDelta: seam,
        issues,
        maps: {
            albedo: encoded(width, height, albedo),
            normal: encoded(width, height, normal),
            roughness: encoded(width, height, roughness),
            detailMask: encoded(width, height, detailMask)
        }
    };
}
