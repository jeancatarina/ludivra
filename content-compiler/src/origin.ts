import { parseTree, type Node } from "jsonc-parser";

export interface SymbolOrigin {
  /** Project-relative file that authored the value. */
  file: string;
  /** JSON pointer inside that file. */
  pointer: string;
  line: number;
  column: number;
}

function pointerOf(path: Array<string | number>): string {
  if (path.length === 0) return "";
  return `/${path
    .map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/")}`;
}

function position(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      lastBreak = index;
    }
  }
  return { line, column: offset - lastBreak };
}

/**
 * Maps every declared id inside a content document to the exact place that
 * authored it. This is what turns "this value is wrong" into "this value came
 * from line 12 of content/run.jsonc", which is the whole reason the pack exists.
 */
export function collectOrigins(file: string, source: string): Map<string, SymbolOrigin> {
  const origins = new Map<string, SymbolOrigin>();
  const root = parseTree(source);
  if (root === undefined) return origins;

  const walk = (node: Node, path: Array<string | number>, ancestorId: string | null, depth: number): void => {
    if (node.type === "object") {
      const idProperty = node.children?.find(
        (child) => child.type === "property" && child.children?.[0]?.value === "id"
      );
      // The root object's own id names the document, which the caller already
      // registered; using it again would prefix every symbol twice.
      const declaredId = depth === 0 ? undefined : idProperty?.children?.[1]?.value;
      const symbol = typeof declaredId === "string"
        ? (ancestorId === null ? declaredId : `${ancestorId}.${declaredId}`)
        : ancestorId;
      if (typeof declaredId === "string" && symbol !== null && !origins.has(symbol)) {
        origins.set(symbol, { file, pointer: pointerOf(path), ...position(source, node.offset) });
      }
      for (const property of node.children ?? []) {
        const key = property.children?.[0]?.value;
        const value = property.children?.[1];
        if (typeof key === "string" && value !== undefined) walk(value, [...path, key], symbol, depth + 1);
      }
      return;
    }
    if (node.type === "array") {
      (node.children ?? []).forEach((child, index) => walk(child, [...path, index], ancestorId, depth + 1));
    }
  };

  walk(root, [], null, 0);
  return origins;
}
