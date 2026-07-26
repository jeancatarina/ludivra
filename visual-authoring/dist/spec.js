import { parse as parseYaml } from "yaml";
export function parseStyleBible(source) {
    const parsed = parseYaml(source);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("VISUAL_STYLE_MISSING");
    }
    return parsed;
}
export function texturePrompt(style, request) {
    const palette = Object.entries(style.palette)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([role, color]) => `${role} ${color}`)
        .join(", ");
    const technical = request.kind === "decal" || request.kind === "mask"
        ? "pure white subject on pure black background; no transparency"
        : request.requirements?.tileable === true
            ? "seamless tile with matching opposite edges"
            : "flat, evenly lit surface color information";
    return [
        `${request.kind} for ${request.material}; ${request.artDirection}.`,
        `Style: ${style.geometry.style}, ${style.geometry.silhouette} silhouette, detail frequency ${style.geometry.detailFrequency}.`,
        `Palette: ${palette}.`,
        `Technical: ${technical}; ${request.resolution} by ${request.resolution}.`,
        `Exclude: ${[...new Set([
                ...request.negative,
                "normal-map",
                "roughness-map",
                "full-character-uv",
                "transparent-background"
            ])].sort().join(", ")}.`
    ].join(" ");
}
