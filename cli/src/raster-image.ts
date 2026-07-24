import { inflateSync } from "node:zlib";

export interface RasterImage {
  width: number;
  height: number;
  /** Row-major RGBA, 8 bits per channel. */
  pixels: Uint8Array;
}

export interface RasterTolerance {
  maxChangedFraction: number;
  maxChannelDelta: number;
}

export interface RasterRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RasterComparison {
  changedPixels: number;
  changedFraction: number;
  maxChannelDelta: number;
  regions: RasterRegion[];
  withinTolerance: boolean;
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const regionCell = 64;

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
}

/**
 * Minimal PNG reader for 8-bit non-interlaced RGB and RGBA, which is what the
 * capture adapter produces. Anything else fails loudly instead of being guessed:
 * a misread baseline would compare the wrong pixels.
 */
export function decodePng(bytes: Buffer): RasterImage {
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
    throw new Error("CAPTURE_IMAGE_NOT_PNG");
  }
  let offset = signature.length;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body.readUInt8(8);
      const colorType = body.readUInt8(9);
      const interlace = body.readUInt8(12);
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`CAPTURE_IMAGE_FORMAT_UNSUPPORTED: depth ${bitDepth} color ${colorType} interlace ${interlace}`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      break;
    }
  }
  if (width === 0 || height === 0 || channels === 0) throw new Error("CAPTURE_IMAGE_HEADER_MISSING");

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  if (raw.length < height * (stride + 1)) throw new Error("CAPTURE_IMAGE_TRUNCATED");
  const rows = new Uint8Array(height * stride);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)] ?? 0;
    const source = (row * (stride + 1)) + 1;
    const target = row * stride;
    for (let index = 0; index < stride; index += 1) {
      const value = raw[source + index] ?? 0;
      const left = index >= channels ? rows[target + index - channels] ?? 0 : 0;
      const up = row > 0 ? rows[target - stride + index] ?? 0 : 0;
      const upLeft = row > 0 && index >= channels ? rows[target - stride + index - channels] ?? 0 : 0;
      let restored = value;
      if (filter === 1) restored = value + left;
      else if (filter === 2) restored = value + up;
      else if (filter === 3) restored = value + Math.floor((left + up) / 2);
      else if (filter === 4) restored = value + paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`CAPTURE_IMAGE_FILTER_UNSUPPORTED: ${filter}`);
      rows[target + index] = restored & 0xff;
    }
  }
  if (channels === 4) return { width, height, pixels: rows };

  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0, source = 0; index < pixels.length; index += 4, source += 3) {
    pixels[index] = rows[source] ?? 0;
    pixels[index + 1] = rows[source + 1] ?? 0;
    pixels[index + 2] = rows[source + 2] ?? 0;
    pixels[index + 3] = 255;
  }
  return { width, height, pixels };
}

/**
 * Compares two frames under a declared tolerance. Byte equality is deliberately
 * not the criterion: driver, font rasterization and antialiasing differ without
 * any defect in the game.
 */
export function compareRasterImages(
  baseline: RasterImage,
  current: RasterImage,
  tolerance: RasterTolerance
): RasterComparison {
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(
      `CAPTURE_IMAGE_SIZE_MISMATCH: baseline ${baseline.width}x${baseline.height} capture ${current.width}x${current.height}`
    );
  }
  const cells = new Map<string, RasterRegion>();
  let changedPixels = 0;
  let maxChannelDelta = 0;
  for (let index = 0, pixel = 0; index < baseline.pixels.length; index += 4, pixel += 1) {
    let delta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs((baseline.pixels[index + channel] ?? 0) - (current.pixels[index + channel] ?? 0));
      if (difference > delta) delta = difference;
    }
    if (delta === 0) continue;
    if (delta > maxChannelDelta) maxChannelDelta = delta;
    changedPixels += 1;
    const x = pixel % baseline.width;
    const y = Math.floor(pixel / baseline.width);
    const cellX = Math.floor(x / regionCell) * regionCell;
    const cellY = Math.floor(y / regionCell) * regionCell;
    const key = `${cellX}:${cellY}`;
    if (!cells.has(key)) {
      cells.set(key, {
        x: cellX,
        y: cellY,
        width: Math.min(regionCell, baseline.width - cellX),
        height: Math.min(regionCell, baseline.height - cellY)
      });
    }
  }
  const total = baseline.width * baseline.height;
  const changedFraction = total === 0 ? 0 : changedPixels / total;
  return {
    changedPixels,
    changedFraction: Number(changedFraction.toFixed(6)),
    maxChannelDelta,
    regions: [...cells.values()].sort((left, right) => left.y - right.y || left.x - right.x),
    withinTolerance:
      changedFraction <= tolerance.maxChangedFraction && maxChannelDelta <= tolerance.maxChannelDelta
  };
}
