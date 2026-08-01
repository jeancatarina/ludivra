import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { optionValue } from "../arguments.js";
import type { Diagnostic } from "../generated/cli-result.js";
import type { CommandContext, CommandOutcome } from "../result.js";

const regionMagic = "LDWR";
const journalMagic = "LDWJ";
const currentVersion = 1;
const maximumBytes = 64 * 1024 * 1024;
const maximumDeltas = 65_536;
const fnvOffset = 14695981039346656037n;
const fnvPrime = 1099511628211n;

interface RegionKey { dimension: number; x: number; y: number; z: number; }
interface RegionDelta { x: number; y: number; z: number; payload: Uint8Array; }
interface RegionRecord {
  key: RegionKey;
  generatorId: string;
  generatorVersion: number;
  seed: bigint;
  deltas: RegionDelta[];
  entities: Uint8Array;
  summary: Uint8Array;
  construction: Uint8Array;
  sourceVersion: number;
}

class StorageFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

class Reader {
  private position = 0;
  private readonly contentSize: number;

  constructor(private readonly bytes: Uint8Array) {
    if (bytes.length < 8) throw new StorageFailure("WORLD_SAVE_CHECKSUM_MISMATCH", "Storage blob has no checksum");
    this.contentSize = bytes.length - 8;
    if (checksum(bytes.subarray(0, this.contentSize)) !== this.u64At(this.contentSize)) {
      throw new StorageFailure("WORLD_SAVE_CHECKSUM_MISMATCH", "Storage checksum does not match");
    }
  }

  magic(expected: string): void {
    const received = new TextDecoder().decode(this.take(4));
    if (received !== expected) throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Storage magic is invalid");
  }

  u32(): number {
    const bytes = this.take(4);
    return (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>> 0;
  }

  i32(): number {
    const value = this.u32();
    return value > 0x7fff_ffff ? value - 0x1_0000_0000 : value;
  }

  u64(): bigint {
    const bytes = this.take(8);
    let value = 0n;
    for (let index = 0; index < 8; index += 1) value |= BigInt(bytes[index]!) << BigInt(index * 8);
    return value;
  }

  text(maximum: number): string {
    const length = this.u32();
    if (length > maximum) throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Storage text exceeds its declared budget");
    return new TextDecoder().decode(this.take(length));
  }

  blob(maximum: number): Uint8Array {
    const length = this.u32();
    if (length > maximum) throw new StorageFailure("WORLD_SAVE_GROWTH_BUDGET_EXCEEDED", "Storage blob exceeds its declared budget");
    return this.take(length);
  }

  complete(): void {
    if (this.position !== this.contentSize) throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Storage blob has trailing bytes");
  }

  private take(length: number): Uint8Array {
    if (length < 0 || this.position + length > this.contentSize) {
      throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Storage blob ends before a complete record");
    }
    const value = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return value;
  }

  private u64At(position: number): bigint {
    let value = 0n;
    for (let index = 0; index < 8; index += 1) value |= BigInt(this.bytes[position + index]!) << BigInt(index * 8);
    return value;
  }
}

class Writer {
  private readonly bytes: number[] = [];

  magic(value: string): void {
    for (const character of value) this.bytes.push(character.charCodeAt(0));
  }

  u32(value: number): void {
    for (let shift = 0; shift < 32; shift += 8) this.bytes.push((value >>> shift) & 0xff);
  }

  i32(value: number): void { this.u32(value >>> 0); }

  u64(value: bigint): void {
    for (let shift = 0n; shift < 64n; shift += 8n) this.bytes.push(Number((value >> shift) & 0xffn));
  }

  text(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.u32(bytes.length);
    this.bytes.push(...bytes);
  }

  blob(value: Uint8Array): void {
    this.u32(value.length);
    this.bytes.push(...value);
  }

  finish(): Uint8Array {
    const content = Uint8Array.from(this.bytes);
    this.u64(checksum(content));
    return Uint8Array.from(this.bytes);
  }
}

function checksum(bytes: Uint8Array): bigint {
  let value = fnvOffset;
  for (const byte of bytes) value = BigInt.asUintN(64, (value ^ BigInt(byte)) * fnvPrime);
  return value;
}

function compareKeys(first: RegionKey, second: RegionKey): number {
  return first.dimension - second.dimension || first.x - second.x || first.y - second.y || first.z - second.z;
}

function regionFile(root: string, key: RegionKey): string {
  return resolve(root, `region-d${key.dimension}-x${key.x}-y${key.y}-z${key.z}.ldwr`);
}

function validateRecord(record: RegionRecord): void {
  if (!Number.isInteger(record.key.dimension) || record.key.dimension < 0 || record.key.dimension > 0xffff ||
      !record.generatorId || record.generatorId.length > 128 || !Number.isInteger(record.generatorVersion) ||
      record.generatorVersion <= 0 || record.deltas.length > maximumDeltas) {
    throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Region record is invalid");
  }
  record.deltas.sort((first, second) => first.x - second.x || first.y - second.y || first.z - second.z);
  for (let index = 1; index < record.deltas.length; index += 1) {
    const first = record.deltas[index - 1]!;
    const second = record.deltas[index]!;
    if (first.x === second.x && first.y === second.y && first.z === second.z) {
      throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Region record contains duplicate chunk deltas");
    }
  }
}

function decodeRegion(bytes: Uint8Array): RegionRecord {
  if (bytes.length > maximumBytes) throw new StorageFailure("WORLD_SAVE_GROWTH_BUDGET_EXCEEDED", "Region file exceeds the storage budget");
  const reader = new Reader(bytes);
  reader.magic(regionMagic);
  const sourceVersion = reader.u32();
  if (sourceVersion !== 0 && sourceVersion !== currentVersion) {
    throw new StorageFailure("WORLD_SAVE_VERSION_UNSUPPORTED", `Region format ${sourceVersion} is unsupported`);
  }
  const dimension = reader.u32();
  if (dimension > 0xffff) throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Region dimension is invalid");
  const record: RegionRecord = {
    key: { dimension, x: reader.i32(), y: reader.i32(), z: reader.i32() },
    generatorId: reader.text(128),
    generatorVersion: reader.u32(),
    seed: reader.u64(),
    deltas: [],
    entities: new Uint8Array(),
    summary: new Uint8Array(),
    construction: new Uint8Array(),
    sourceVersion
  };
  const deltaCount = reader.u32();
  if (deltaCount > maximumDeltas) throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Region delta count exceeds the limit");
  for (let index = 0; index < deltaCount; index += 1) {
    record.deltas.push({ x: reader.i32(), y: reader.i32(), z: reader.i32(), payload: reader.blob(maximumBytes) });
  }
  record.entities = reader.blob(maximumBytes);
  if (sourceVersion === 0) {
    record.construction = reader.blob(maximumBytes);
  } else {
    record.summary = reader.blob(maximumBytes);
    record.construction = reader.blob(maximumBytes);
  }
  reader.complete();
  validateRecord(record);
  return record;
}

function encodeRegion(input: RegionRecord): Uint8Array {
  const record: RegionRecord = { ...input, deltas: input.deltas.map((delta) => ({ ...delta })) };
  validateRecord(record);
  const writer = new Writer();
  writer.magic(regionMagic);
  writer.u32(currentVersion);
  writer.u32(record.key.dimension);
  writer.i32(record.key.x);
  writer.i32(record.key.y);
  writer.i32(record.key.z);
  writer.text(record.generatorId);
  writer.u32(record.generatorVersion);
  writer.u64(record.seed);
  writer.u32(record.deltas.length);
  for (const delta of record.deltas) {
    writer.i32(delta.x);
    writer.i32(delta.y);
    writer.i32(delta.z);
    writer.blob(delta.payload);
  }
  writer.blob(record.entities);
  writer.blob(record.summary);
  writer.blob(record.construction);
  const bytes = writer.finish();
  if (bytes.length > maximumBytes) throw new StorageFailure("WORLD_SAVE_GROWTH_BUDGET_EXCEEDED", "Canonical region exceeds the storage budget");
  return bytes;
}

function decodeJournal(bytes: Uint8Array): RegionRecord[] {
  const reader = new Reader(bytes);
  reader.magic(journalMagic);
  const version = reader.u32();
  if (version !== currentVersion) throw new StorageFailure("WORLD_SAVE_VERSION_UNSUPPORTED", "Journal format is unsupported");
  const count = reader.u32();
  if (count === 0 || count > 4096) throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Journal transaction count is invalid");
  const regions: RegionRecord[] = [];
  for (let index = 0; index < count; index += 1) regions.push(decodeRegion(reader.blob(maximumBytes)));
  reader.complete();
  regions.sort((first, second) => compareKeys(first.key, second.key));
  for (let index = 1; index < regions.length; index += 1) {
    if (compareKeys(regions[index - 1]!.key, regions[index]!.key) === 0) {
      throw new StorageFailure("WORLD_SAVE_FORMAT_INVALID", "Journal contains duplicate regions");
    }
  }
  return regions;
}

async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.tmp`;
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function ensureRoot(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
}

function diagnostic(error: unknown): Diagnostic {
  if (error instanceof StorageFailure) return { code: error.code, severity: "error", message: error.message };
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return { code: "WORLD_REGION_ORPHANED", severity: "error", message: "Storage root or region is missing" };
  }
  return { code: "WORLD_SAVE_WRITE_NOT_ATOMIC", severity: "error", message: error instanceof Error ? error.message : "Storage operation failed" };
}

async function listRegions(root: string): Promise<{ path: string; record: RegionRecord }[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const regions: { path: string; record: RegionRecord }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ldwr")) continue;
    const path = resolve(root, entry.name);
    regions.push({ path, record: decodeRegion(await readFile(path)) });
  }
  regions.sort((first, second) => compareKeys(first.record.key, second.record.key));
  return regions;
}

export async function runStorage(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  void context;
  const operation = arguments_[1];
  const rootArgument = optionValue(arguments_, "--root");
  if (rootArgument === undefined || rootArgument.length === 0) {
    return { diagnostics: [{ code: "WORLD_STORAGE_ROOT_REQUIRED", severity: "error", message: "Use --root <storage-directory>" }], nextActions: ["Run game storage inspect --root <storage-directory>"] };
  }
  const root = resolve(rootArgument);
  try {
    switch (operation) {
      case "inspect": {
        const regions = await listRegions(root);
        return {
          diagnostics: [],
          data: {
            root,
            regions: regions.map(({ record }) => ({ key: record.key, generatorId: record.generatorId, generatorVersion: record.generatorVersion,
              seed: record.seed.toString(), deltaCount: record.deltas.length, sourceVersion: record.sourceVersion })),
            pendingJournal: await exists(`${resolve(root, "journal.ldwj")}`),
            incompleteJournal: await exists(`${resolve(root, "journal.ldwj.tmp")}`)
          },
          nextActions: ["Run game storage recover --root <storage-directory> before writing when pendingJournal is true"]
        };
      }
      case "recover": {
        await ensureRoot(root);
        const temporary = resolve(root, "journal.ldwj.tmp");
        const journal = resolve(root, "journal.ldwj");
        const discardedIncompleteJournal = await exists(temporary);
        if (discardedIncompleteJournal) await rm(temporary);
        if (!(await exists(journal))) {
          const diagnostics: Diagnostic[] = discardedIncompleteJournal
            ? [{ code: "WORLD_SAVE_JOURNAL_INCOMPLETE", severity: "warning", message: "Discarded an incomplete journal temporary file" }]
            : [];
          return { diagnostics, data: { root, replayedRegions: 0, discardedIncompleteJournal }, nextActions: ["Run game storage inspect --root <storage-directory>"] };
        }
        const regions = decodeJournal(await readFile(journal));
        for (const region of regions) await writeAtomic(regionFile(root, region.key), encodeRegion(region));
        await rm(journal);
        return { diagnostics: [], data: { root, replayedRegions: regions.length, discardedIncompleteJournal }, nextActions: ["Run game storage inspect --root <storage-directory>"] };
      }
      case "compact": {
        if (await exists(resolve(root, "journal.ldwj"))) {
          throw new StorageFailure("WORLD_SAVE_JOURNAL_INCOMPLETE", "Recover the pending journal before compaction");
        }
        const regions = await listRegions(root);
        for (const region of regions) await writeAtomic(region.path, encodeRegion(region.record));
        return { diagnostics: [], data: { root, compactedRegions: regions.length }, nextActions: ["Run game storage inspect --root <storage-directory>"] };
      }
      case "migrate": {
        if (await exists(resolve(root, "journal.ldwj"))) {
          throw new StorageFailure("WORLD_SAVE_JOURNAL_INCOMPLETE", "Recover the pending journal before migration");
        }
        const regions = await listRegions(root);
        let migratedRegions = 0;
        for (const region of regions) {
          if (region.record.sourceVersion !== currentVersion) {
            await writeAtomic(region.path, encodeRegion(region.record));
            migratedRegions += 1;
          }
        }
        return { diagnostics: [], data: { root, migratedRegions }, nextActions: ["Run game storage inspect --root <storage-directory>"] };
      }
      default:
        return { diagnostics: [{ code: "WORLD_STORAGE_OPERATION_UNKNOWN", severity: "error", message: "Use inspect, recover, compact or migrate" }], nextActions: ["Run game storage inspect --root <storage-directory>"] };
    }
  } catch (error) {
    return { diagnostics: [diagnostic(error)], nextActions: ["Inspect the storage journal and retry the requested operation"] };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
