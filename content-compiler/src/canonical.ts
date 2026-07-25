/**
 * Canonical JSON: the encoding of every pack section in version 1.
 *
 * Determinism is the whole point. Keys are sorted, there is no redundant space,
 * no timestamp, no absolute path and no locale-dependent formatting, so the same
 * inputs produce the same bytes on any machine.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CONTENT_PACK_VALUE_UNSUPPORTED: numbers must be finite");
    // Negative zero and positive zero are the same logical value.
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") {
    throw new Error(`CONTENT_PACK_VALUE_UNSUPPORTED: ${typeof value}`);
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
