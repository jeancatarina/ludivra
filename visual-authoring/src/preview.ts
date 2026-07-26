import type { BoneDefinition, CharacterGeometry, SurfaceSegment, Vector3 } from "./geometry.js";
import type { CharacterSpec, VisualStyleBible } from "./spec.js";
import type { VisualValidationReport } from "./validation.js";

type View = "front" | "back" | "side" | "three-quarter";

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function projected(point: Vector3, view: View): [number, number] {
  if (view === "back") return [-point[0], point[1]];
  if (view === "side") return [point[2], point[1]];
  if (view === "three-quarter") return [point[0] * 0.72 + point[2] * 0.48, point[1]];
  return [point[0], point[1]];
}

function drawBone(
  bone: BoneDefinition,
  view: View,
  originX: number,
  originY: number,
  scale: number,
  color: string
): string {
  const start = projected(bone.start, view);
  const end = projected(bone.end, view);
  const x1 = originX + start[0] * scale;
  const y1 = originY - start[1] * scale;
  const x2 = originX + end[0] * scale;
  const y2 = originY - end[1] * scale;
  return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${Math.max(2, bone.radiusStart * scale * 1.75).toFixed(2)}" stroke-linecap="round"/>`;
}

function viewPanel(
  segments: SurfaceSegment[],
  view: View,
  x: number,
  color: string,
  accent: string,
  heightM: number
): string {
  const originX = x + 130;
  const originY = 360;
  const scale = 245 / heightM;
  const bones = segments
    .map((bone) => drawBone(bone, view, originX, originY, scale, bone.name.includes("head") ? accent : bone.color || color))
    .join("");
  return [
    `<g><rect x="${x}" y="74" width="260" height="310" rx="18" fill="#111923" stroke="#294054"/>`,
    `<text x="${x + 20}" y="105" fill="#9db4c8" font-size="14" font-family="system-ui">${escape(view)}</text>`,
    `<line x1="${x + 24}" y1="360" x2="${x + 236}" y2="360" stroke="#284050" stroke-width="1"/>`,
    bones,
    "</g>"
  ].join("");
}

function turntable(
  segments: SurfaceSegment[],
  x: number,
  y: number,
  color: string,
  heightM: number
): string {
  const frames: string[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    const angle = (frame / 8) * Math.PI * 2;
    const frameX = x + frame * 92;
    const scale = 72 / heightM;
    const lines = segments.map((bone) => {
      const rotate = (point: Vector3): Vector3 => [
        point[0] * Math.cos(angle) + point[2] * Math.sin(angle),
        point[1],
        -point[0] * Math.sin(angle) + point[2] * Math.cos(angle)
      ];
      const start = rotate(bone.start);
      const end = rotate(bone.end);
      return `<line x1="${(frameX + start[0] * scale).toFixed(2)}" y1="${(y - start[1] * scale).toFixed(2)}" x2="${(frameX + end[0] * scale).toFixed(2)}" y2="${(y - end[1] * scale).toFixed(2)}" stroke="${bone.color || color}" stroke-width="${Math.max(1.2, bone.radiusStart * scale).toFixed(2)}" stroke-linecap="round"/>`;
    }).join("");
    frames.push(`<g>${lines}<circle cx="${frameX}" cy="${y + 4}" r="2" fill="#355064"/></g>`);
  }
  return frames.join("");
}

export function renderCharacterPreview(
  spec: CharacterSpec,
  style: VisualStyleBible,
  geometry: CharacterGeometry,
  report: VisualValidationReport
): string {
  const base = style.palette[spec.skin] ?? style.palette.skin ?? "#7c9d5d";
  const accent = style.palette.accent ?? "#8df0c5";
  const panels = (["front", "back", "side", "three-quarter"] as View[])
    .map((view, index) => viewPanel(geometry.segments, view, 32 + index * 278, base, accent, spec.anatomy.heightM))
    .join("");
  const clips = spec.animations.map((animation, index) =>
    `<g transform="translate(${36 + index * 126} 555)"><rect width="112" height="30" rx="15" fill="#193044"/><circle cx="17" cy="15" r="4" fill="${accent}"/><text x="30" y="20" fill="#d9e8ef" font-size="13" font-family="system-ui">${escape(animation)}</text></g>`
  ).join("");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650" viewBox="0 0 1200 650">',
    '<rect width="1200" height="650" fill="#080d13"/>',
    `<text x="32" y="38" fill="#f1f7fa" font-size="24" font-family="system-ui" font-weight="700">${escape(spec.id)}</text>`,
    `<text x="32" y="61" fill="#7f9aae" font-size="13" font-family="system-ui">style ${escape(style.id)} · seed ${spec.seed} · ${report.metrics.triangles} triangles · ${report.metrics.bones} bones · validation ${report.status}</text>`,
    panels,
    '<text x="32" y="424" fill="#9db4c8" font-size="14" font-family="system-ui">turntable · 8 angles</text>',
    turntable(geometry.segments, 70, 522, base, spec.anatomy.heightM),
    '<text x="32" y="542" fill="#9db4c8" font-size="14" font-family="system-ui">semantic clips</text>',
    clips,
    `<text x="1168" y="624" text-anchor="end" fill="${accent}" font-size="12" font-family="system-ui">@ludivra/visual-authoring</text>`,
    "</svg>\n"
  ].join("");
}
