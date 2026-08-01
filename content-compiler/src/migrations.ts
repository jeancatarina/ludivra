import {
  CONTENT_MIGRATIONS,
  type ContentMigrationSpec,
  type ContentSchemaIdentity
} from "./generated/content-migrations.js";

export { CONTENT_MIGRATION_REGISTRY_VERSION, CONTENT_MIGRATIONS } from "./generated/content-migrations.js";
export type { ContentMigrationSpec, ContentSchemaIdentity } from "./generated/content-migrations.js";

export interface AppliedContentMigration {
  id: string;
  from: ContentSchemaIdentity;
  to: ContentSchemaIdentity;
}

export interface MigratedContentDocument {
  value: unknown;
  source: ContentSchemaIdentity;
  target: ContentSchemaIdentity;
  applied: AppliedContentMigration[];
}

type JsonObject = Record<string, unknown>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function identity(value: unknown): ContentSchemaIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("CONTENT_MIGRATION_REQUIRED: document root is not an object");
  }
  const document = value as JsonObject;
  if (typeof document.$schema !== "string" || !Number.isInteger(document.schemaVersion)) {
    throw new Error("CONTENT_MIGRATION_REQUIRED: document schema identity is missing");
  }
  return { schema: document.$schema, schemaVersion: document.schemaVersion as number };
}

function sameIdentity(left: ContentSchemaIdentity, right: ContentSchemaIdentity): boolean {
  return left.schema === right.schema && left.schemaVersion === right.schemaVersion;
}

function pointerTokens(pointer: string): string[] {
  if (!pointer.startsWith("/") || pointer.length === 1) throw new Error(`CONTENT_MIGRATION_POINTER_INVALID: ${pointer}`);
  return pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function parentAt(document: JsonObject, pointer: string): { parent: JsonObject; key: string } {
  const tokens = pointerTokens(pointer);
  const key = tokens.pop();
  if (key === undefined) throw new Error(`CONTENT_MIGRATION_POINTER_INVALID: ${pointer}`);
  let current: JsonObject = document;
  for (const token of tokens) {
    const next = current[token];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      throw new Error(`CONTENT_MIGRATION_POINTER_UNKNOWN: ${pointer}`);
    }
    current = next as JsonObject;
  }
  return { parent: current, key };
}

function rename(document: JsonObject, from: string, to: string): void {
  const source = parentAt(document, from);
  const target = parentAt(document, to);
  if (!(source.key in source.parent)) throw new Error(`CONTENT_MIGRATION_POINTER_UNKNOWN: ${from}`);
  if (target.key in target.parent) throw new Error(`CONTENT_MIGRATION_CONFLICT: ${to}`);
  target.parent[target.key] = source.parent[source.key];
  delete source.parent[source.key];
}

function applyMigration(value: unknown, migration: ContentMigrationSpec): unknown {
  const document = clone(value) as JsonObject;
  for (const operation of migration.operations) {
    if (operation.op === "rename") rename(document, operation.from, operation.to);
  }
  document.$schema = migration.to.schema;
  document.schemaVersion = migration.to.schemaVersion;
  return document;
}

/**
 * Applies the one declared path from the authored document to the schema named
 * by its game manifest descriptor. The returned document is safe to validate
 * and compile; no runtime host ever migrates a pack.
 */
export function migrateContentDocument(
  value: unknown,
  targetSchema?: string,
  migrations: readonly ContentMigrationSpec[] = CONTENT_MIGRATIONS
): MigratedContentDocument {
  const source = identity(value);
  let current = source;
  let migrated = value;
  const applied: AppliedContentMigration[] = [];
  const visited = new Set<string>();
  while (targetSchema === undefined || current.schema !== targetSchema) {
    const transition = `${current.schema}@${current.schemaVersion}`;
    if (visited.has(transition)) throw new Error(`CONTENT_MIGRATION_CYCLE: ${transition}`);
    visited.add(transition);
    const candidates = migrations.filter((migration) => sameIdentity(migration.from, current));
    if (candidates.length === 0) {
      throw new Error(`CONTENT_MIGRATION_REQUIRED: ${transition}${targetSchema === undefined ? "" : ` -> ${targetSchema}`}`);
    }
    if (candidates.length > 1) throw new Error(`CONTENT_MIGRATION_AMBIGUOUS: ${transition}`);
    const migration = candidates[0];
    if (migration === undefined) throw new Error(`CONTENT_MIGRATION_REQUIRED: ${transition}`);
    migrated = applyMigration(migrated, migration);
    current = identity(migrated);
    applied.push({ id: migration.id, from: migration.from, to: migration.to });
  }
  return { value: migrated, source, target: current, applied };
}
