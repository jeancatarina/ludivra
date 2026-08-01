// Generated from contracts/content-migrations-v1.json. Do not edit.

export const CONTENT_MIGRATION_REGISTRY_VERSION = 1 as const;

export interface ContentSchemaIdentity { schema: string; schemaVersion: number; }
export interface RenameContentMigrationOperation { op: "rename"; from: string; to: string; }
export type ContentMigrationOperation = RenameContentMigrationOperation;
export interface ContentMigrationSpec {
  id: string;
  from: ContentSchemaIdentity;
  to: ContentSchemaIdentity;
  operations: readonly ContentMigrationOperation[];
  fixtures: { input: string; output: string };
}

export const CONTENT_MIGRATIONS: readonly ContentMigrationSpec[] = [
  {
    "id": "card-roguelite-v1-to-v2",
    "from": {
      "schema": "https://ludivra.dev/schemas/card-roguelite/v1",
      "schemaVersion": 1
    },
    "to": {
      "schema": "https://ludivra.dev/schemas/card-roguelite/v2",
      "schemaVersion": 2
    },
    "operations": [
      {
        "op": "rename",
        "from": "/run/rewardHeal",
        "to": "/run/rewardHealAmount"
      }
    ],
    "fixtures": {
      "input": "content-compiler/test/fixtures/migrations/card-roguelite-v1.input.json",
      "output": "content-compiler/test/fixtures/migrations/card-roguelite-v2.expected.json"
    }
  }
] as const;
