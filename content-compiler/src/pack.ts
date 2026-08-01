import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.js";
import { migrateContentDocument, type AppliedContentMigration, type ContentSchemaIdentity } from "./migrations.js";
import { collectOrigins, type SymbolOrigin } from "./origin.js";

/**
 * Version of the container. It is not the version of a document: each document
 * keeps its own schema version, and this one covers the layout of the pack.
 */
export const PACK_FORMAT_VERSION = 2;

/** Version of the compiler itself, so improving it regenerates every pack. */
export const CONTENT_GENERATOR_VERSION = 2;

export interface ContentDocumentInput {
  id: string;
  /** Target schema declared by game.jsonc; legacy source is migrated to it. */
  schema?: string;
  /** Project-relative path, used for origin and for diagnostics. */
  file: string;
  source: string;
  value: unknown;
}

export interface LocaleStringsInput {
  locale: string;
  entries: Record<string, string>;
}

export interface ContentPackInput {
  documents: readonly ContentDocumentInput[];
  strings?: readonly LocaleStringsInput[];
}

export interface PackSection {
  sha256: string;
  value: unknown;
}

export interface ContentPack {
  packFormatVersion: number;
  generatorVersion: number;
  sections: {
    symbols: PackSection;
    documents: PackSection;
    origin: PackSection;
    strings: PackSection;
    migrations: PackSection;
  };
}

export interface ContentPackMigrationRecord {
  document: string;
  source: ContentSchemaIdentity;
  target: ContentSchemaIdentity;
  applied: AppliedContentMigration[];
}

export interface CompiledContentPack {
  pack: ContentPack;
  /** Canonical bytes, which are what the hosts load and what the hash covers. */
  bytes: Uint8Array;
  sha256: string;
  symbols: string[];
}

function section(value: unknown): PackSection {
  const encoded = canonicalJson(value);
  return { sha256: createHash("sha256").update(encoded).digest("hex"), value };
}

/**
 * Compiles validated documents into the derived pack. The JSONC files remain the
 * only editable source: this output is regenerable, never authored, and identified
 * by the hash of its canonical bytes.
 */
export function compileContentPack(input: ContentPackInput): CompiledContentPack {
  const documents: Record<string, unknown> = {};
  const origin: Record<string, SymbolOrigin> = {};
  const symbols: Record<string, { document: string }> = {};
  const migrations: ContentPackMigrationRecord[] = [];

  for (const document of [...input.documents].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    if (document.id in documents) {
      throw new Error(`CONTENT_PACK_SYMBOL_DUPLICATE: ${document.id}`);
    }
    const migrated = document.schema === undefined
      ? undefined
      : migrateContentDocument(document.value, document.schema);
    const value = migrated?.value ?? document.value;
    documents[document.id] = value;
    if (migrated !== undefined && migrated.applied.length > 0) {
      migrations.push({
        document: document.id,
        source: migrated.source,
        target: migrated.target,
        applied: migrated.applied
      });
    }
    symbols[document.id] = { document: document.id };
    origin[document.id] = { file: document.file, pointer: "", line: 1, column: 1 };
    for (const [name, place] of collectOrigins(document.file, document.source)) {
      const symbol = `${document.id}.${name}`;
      if (symbol in symbols) throw new Error(`CONTENT_PACK_SYMBOL_DUPLICATE: ${symbol}`);
      symbols[symbol] = { document: document.id };
      origin[symbol] = place;
    }
  }

  const strings: Record<string, Record<string, string>> = {};
  for (const table of input.strings ?? []) strings[table.locale] = table.entries;

  const pack: ContentPack = {
    packFormatVersion: PACK_FORMAT_VERSION,
    generatorVersion: CONTENT_GENERATOR_VERSION,
    sections: {
      symbols: section(symbols),
      documents: section(documents),
      origin: section(origin),
      strings: section(strings),
      migrations: section(migrations)
    }
  };
  const encoded = canonicalJson(pack);
  return {
    pack,
    bytes: new TextEncoder().encode(encoded),
    sha256: createHash("sha256").update(encoded).digest("hex"),
    symbols: Object.keys(symbols).sort()
  };
}

export interface PackReadResult {
  pack: ContentPack;
  /** Failure code when the pack cannot be trusted, null when it can. */
  failure: string | null;
}

/**
 * Reads a pack and refuses it when the container version is unknown or when a
 * section hash does not match its content. Reinterpreting either by trial is what
 * turns an incompatibility into a guess.
 */
export function readContentPack(bytes: Uint8Array): PackReadResult {
  let parsed: ContentPack;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as ContentPack;
  } catch {
    return { pack: emptyPack(), failure: "CONTENT_PACK_FORMAT_UNSUPPORTED" };
  }
  if (parsed.packFormatVersion !== PACK_FORMAT_VERSION) {
    return { pack: emptyPack(), failure: "CONTENT_PACK_FORMAT_UNSUPPORTED" };
  }
  for (const name of ["symbols", "documents", "origin", "strings", "migrations"] as const) {
    const sectionValue = parsed.sections?.[name];
    if (sectionValue === undefined) return { pack: emptyPack(), failure: "CONTENT_PACK_FORMAT_UNSUPPORTED" };
    let recomputed: string;
    try {
      recomputed = createHash("sha256").update(canonicalJson(sectionValue.value)).digest("hex");
    } catch {
      return { pack: emptyPack(), failure: "CONTENT_PACK_FORMAT_UNSUPPORTED" };
    }
    if (recomputed !== sectionValue.sha256) {
      return { pack: emptyPack(), failure: `CONTENT_PACK_HASH_MISMATCH: ${name}` };
    }
  }
  return { pack: parsed, failure: null };
}

function emptyPack(): ContentPack {
  const blank = section({});
  return {
    packFormatVersion: PACK_FORMAT_VERSION,
    generatorVersion: CONTENT_GENERATOR_VERSION,
    sections: { symbols: blank, documents: blank, origin: blank, strings: blank, migrations: blank }
  };
}

/** Cache identity of a pack: its inputs and the compiler that produced them. */
export function contentPackCacheKey(input: ContentPackInput): string {
  const hasher = createHash("sha256").update(`${PACK_FORMAT_VERSION}\0${CONTENT_GENERATOR_VERSION}`);
  for (const document of [...input.documents].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    // The target schema can change the derived value through a declared migration,
    // even when the authored JSONC bytes are identical.
    hasher.update(`\0${document.id}\0${document.schema ?? ""}\0${document.file}\0${document.source}`);
  }
  for (const table of input.strings ?? []) {
    hasher.update(`\0${table.locale}\0${canonicalJson(table.entries)}`);
  }
  return hasher.digest("hex");
}
