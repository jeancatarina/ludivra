import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTENT_MIGRATIONS,
  canonicalJson,
  compileContentPack,
  contentPackCacheKey,
  collectOrigins,
  migrateContentDocument,
  readContentPack
} from "../dist/index.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

const runSource = `{
  // Conteúdo do vertical slice. O documento declara seu próprio id na raiz,
  // como o conteúdo real do card roguelite.
  "id": "ember-vault.run",
  "schemaVersion": 1,
  "cards": [
    { "id": "strike", "cost": 1, "damage": 6 },
    { "id": "guard", "cost": 1, "block": 5 }
  ],
  "rooms": [
    { "id": "ember-hall", "enemy": { "id": "goblin", "health": 10 } }
  ]
}`;

function input() {
  return {
    documents: [
      {
        id: "ember-vault.run",
        file: "content/run.jsonc",
        source: runSource,
        value: JSON.parse(runSource.replace(/^\s*\/\/.*$/gm, ""))
      }
    ],
    strings: [{ locale: "base", entries: { "state.energy": "Energia: {value}" } }]
  };
}

test("canonical json sorts keys and refuses values it cannot reproduce", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] }), '{"a":[2,{"c":3,"d":4}],"b":1}');
  assert.equal(canonicalJson(-0), "0");
  assert.throws(() => canonicalJson(Number.NaN), /CONTENT_PACK_VALUE_UNSUPPORTED/);
  assert.throws(() => canonicalJson(() => 1), /CONTENT_PACK_VALUE_UNSUPPORTED/);
});

test("a pack compiles to identical bytes for identical inputs", () => {
  const first = compileContentPack(input());
  const second = compileContentPack(input());
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(Buffer.from(first.bytes), Buffer.from(second.bytes));
  assert.equal(contentPackCacheKey(input()), contentPackCacheKey(input()));

  // Editing the source changes the identity of the artifact.
  const edited = input();
  edited.documents[0].source = runSource.replace('"damage": 6', '"damage": 7');
  edited.documents[0].value = JSON.parse(edited.documents[0].source.replace(/^\s*\/\/.*$/gm, ""));
  assert.notEqual(compileContentPack(edited).sha256, first.sha256);
});

test("every declared id is addressable and traceable to its line", () => {
  const compiled = compileContentPack(input());
  assert.ok(compiled.symbols.includes("ember-vault.run"));
  assert.ok(compiled.symbols.includes("ember-vault.run.strike"));
  assert.ok(compiled.symbols.includes("ember-vault.run.ember-hall"));
  // Nested declarations keep their parent in the symbol path.
  assert.ok(compiled.symbols.includes("ember-vault.run.ember-hall.goblin"));
  // The document id must not be repeated inside its own symbols.
  assert.ok(!compiled.symbols.some((symbol) => symbol.includes("ember-vault.run.ember-vault.run")));

  const origin = compiled.pack.sections.origin.value["ember-vault.run.strike"];
  assert.equal(origin.file, "content/run.jsonc");
  assert.equal(origin.pointer, "/cards/0");
  assert.equal(origin.line, 7, "the strike card is authored on line 7");
  assert.ok(origin.column > 0);
});

test("origins are collected straight from the authored text", () => {
  const origins = collectOrigins("content/run.jsonc", runSource);
  assert.equal(origins.get("guard").pointer, "/cards/1");
  assert.equal(origins.get("guard").line, 8);
});

test("a pack is refused when its version or its section hash does not match", () => {
  const compiled = compileContentPack(input());
  const round = readContentPack(compiled.bytes);
  assert.equal(round.failure, null);
  assert.equal(round.pack.sections.documents.sha256, compiled.pack.sections.documents.sha256);

  const tampered = JSON.parse(new TextDecoder().decode(compiled.bytes));
  tampered.sections.documents.value["ember-vault.run"].cards[0].damage = 999;
  const tamperedResult = readContentPack(new TextEncoder().encode(JSON.stringify(tampered)));
  assert.match(tamperedResult.failure, /CONTENT_PACK_HASH_MISMATCH/);

  const future = JSON.parse(new TextDecoder().decode(compiled.bytes));
  future.packFormatVersion = 99;
  assert.equal(
    readContentPack(new TextEncoder().encode(JSON.stringify(future))).failure,
    "CONTENT_PACK_FORMAT_UNSUPPORTED"
  );
  assert.equal(readContentPack(new TextEncoder().encode("not json")).failure, "CONTENT_PACK_FORMAT_UNSUPPORTED");
});

test("declared migrations are ordered, idempotent and recorded in the derived pack", () => {
  const migration = CONTENT_MIGRATIONS[0];
  assert.ok(migration);
  const legacy = JSON.parse(readFileSync(resolve(root, migration.fixtures.input), "utf8"));
  const expected = JSON.parse(readFileSync(resolve(root, migration.fixtures.output), "utf8"));
  const migrated = migrateContentDocument(legacy, migration.to.schema);
  assert.deepEqual(migrated.value, expected);
  assert.deepEqual(migrated.applied.map(({ id }) => id), [migration.id]);
  assert.deepEqual(migrateContentDocument(migrated.value, migration.to.schema).value, expected);

  const compiled = compileContentPack({
    documents: [{
      id: "ember-vault.run",
      schema: migration.to.schema,
      file: migration.fixtures.input,
      source: JSON.stringify(legacy),
      value: legacy
    }]
  });
  assert.deepEqual(compiled.pack.sections.documents.value["ember-vault.run"], expected);
  assert.deepEqual(compiled.pack.sections.migrations.value, [{
    document: "ember-vault.run",
    source: migration.from,
    target: migration.to,
    applied: [{ id: migration.id, from: migration.from, to: migration.to }]
  }]);

  assert.throws(
    () => migrateContentDocument(legacy, migration.to.schema, [...CONTENT_MIGRATIONS, { ...migration, id: "duplicate-path" }]),
    /CONTENT_MIGRATION_AMBIGUOUS/
  );
  assert.throws(
    () => migrateContentDocument({ ...legacy, schemaVersion: 0 }, migration.to.schema),
    /CONTENT_MIGRATION_REQUIRED/
  );
});

test("duplicate symbols are refused instead of overwriting each other", () => {
  const duplicated = input();
  duplicated.documents.push({ ...duplicated.documents[0] });
  assert.throws(() => compileContentPack(duplicated), /CONTENT_PACK_SYMBOL_DUPLICATE/);
});
