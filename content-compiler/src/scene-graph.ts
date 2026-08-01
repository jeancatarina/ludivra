import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.js";

export const SCENE_GRAPH_DOCUMENT_ID = "ludivra.scene-graph";
export const SCENE_GRAPH_VERSION = 1;
export const SCENE_SCHEMA_ID = "https://ludivra.dev/schemas/scene/v1";
export const PREFAB_SCHEMA_ID = "https://ludivra.dev/schemas/prefab/v1";

export interface SceneGraphSource {
  /** Stable semantic identifier declared by game.jsonc. */
  id: string;
  /** Project-relative authored source, preserved for diagnostics. */
  file: string;
  value: unknown;
}

export interface CompiledSceneGraph {
  graph: SceneGraph;
  bytes: Uint8Array;
  sha256: string;
}

export interface SceneGraph {
  graphVersion: number;
  scenes: readonly SceneGraphDocument[];
  prefabs: readonly PrefabDocument[];
  resources: readonly SceneResource[];
}

export interface SceneGraphDocument {
  id: string;
  root: string;
  nodes: readonly SceneNode[];
  resources: readonly SceneResource[];
}

export interface PrefabDocument extends SceneGraphDocument {
  base?: string;
  parameters: readonly PrefabParameter[];
  overrides: readonly PrefabOverride[];
  slots: readonly PrefabSlot[];
}

export interface SceneResource {
  id: string;
  kind: "visual" | "audio" | "vfx" | "animation" | "navigation";
  source: string;
}

export interface SceneNode {
  id: string;
  parent?: string;
  prefab?: string;
  components?: Record<string, unknown>;
  parameters?: Record<string, string | number | boolean>;
  overrides?: readonly { id: string; value: string | number | boolean }[];
  slots?: readonly { id: string; prefab: string }[];
}

export interface PrefabParameter {
  id: string;
  type: "string" | "integer" | "number" | "boolean";
  default: string | number | boolean;
}

export interface PrefabOverride {
  id: string;
  target: string;
  path: string;
  type: "string" | "integer" | "number" | "boolean";
}

export interface PrefabSlot {
  id: string;
  required: boolean;
}

type JsonObject = Record<string, unknown>;
type Primitive = string | number | boolean;
type PreparedDocument = {
  id: string;
  file: string;
  root: string;
  nodes: JsonObject[];
  resources: SceneResource[];
  value: JsonObject;
};

const idPattern = /^[a-z][a-z0-9.-]*$/;
const nodeIdPattern = /^[a-z][a-z0-9-]*$/;
const componentNames = new Set([
  "transform", "visual", "light", "camera", "audioEmitter", "vfxEmitter",
  "animation", "physics", "navigation", "spawnBinding"
]);

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function object(value: unknown, code: string, message: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code, message);
  return value as JsonObject;
}

function array(value: unknown, code: string, message: string): unknown[] {
  if (!Array.isArray(value)) fail(code, message);
  return value;
}

function string(value: unknown, code: string, message: string): string {
  if (typeof value !== "string") fail(code, message);
  return value;
}

function primitive(value: unknown, code: string, message: string): Primitive {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") fail(code, message);
  return value;
}

function asId(value: unknown, code: string, message: string, pattern = idPattern): string {
  const result = string(value, code, message);
  if (!pattern.test(result)) fail(code, message);
  return result;
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function typedValue(type: PrefabParameter["type"], value: Primitive): boolean {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

function valueAtPointer(value: unknown, pointer: string): unknown {
  if (!pointer.startsWith("/")) return undefined;
  let current = value;
  for (const token of pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (typeof current !== "object" || current === null || Array.isArray(current) || !(token in current)) return undefined;
    current = (current as JsonObject)[token];
  }
  return current;
}

function readResources(document: JsonObject, owner: string): SceneResource[] {
  const seen = new Set<string>();
  return array(document.resources, "SCENE_SCHEMA_INVALID", `${owner} resources must be an array`).map((value) => {
    const resource = object(value, "SCENE_SCHEMA_INVALID", `${owner} resource must be an object`);
    const id = asId(resource.id, "SCENE_ID_UNSTABLE", `${owner} resource has no stable id`);
    if (seen.has(id)) fail("SCENE_ID_UNSTABLE", `${owner} declares resource ${id} twice`);
    seen.add(id);
    const kind = string(resource.kind, "SCENE_SCHEMA_INVALID", `${owner} resource ${id} has no kind`);
    if (!(["visual", "audio", "vfx", "animation", "navigation"] as const).includes(kind as SceneResource["kind"])) {
      fail("SCENE_SCHEMA_INVALID", `${owner} resource ${id} has unsupported kind ${kind}`);
    }
    return {
      id,
      kind: kind as SceneResource["kind"],
      source: string(resource.source, "SCENE_SCHEMA_INVALID", `${owner} resource ${id} has no source`)
    };
  });
}

function readDocument(source: SceneGraphSource, schema: string, kind: "scene" | "prefab"): PreparedDocument {
  const value = object(source.value, "SCENE_SCHEMA_INVALID", `${source.file} root must be an object`);
  if (value.$schema !== schema || value.schemaVersion !== 1) {
    fail("SCENE_SCHEMA_INVALID", `${source.file} does not declare ${schema}`);
  }
  const id = asId(value.id, "SCENE_ID_UNSTABLE", `${source.file} has no stable ${kind} id`);
  if (id !== source.id) fail("SCENE_ID_UNSTABLE", `${source.file} id ${id} does not match game.jsonc ${source.id}`);
  const root = asId(value.root, "SCENE_ID_UNSTABLE", `${source.file} has no stable root id`, nodeIdPattern);
  const nodes = array(value.nodes, "SCENE_SCHEMA_INVALID", `${source.file} nodes must be an array`).map((node) =>
    object(node, "SCENE_SCHEMA_INVALID", `${source.file} node must be an object`)
  );
  if (nodes.length === 0) fail("SCENE_SCHEMA_INVALID", `${source.file} must declare at least one node`);
  return { id, file: source.file, root, nodes, resources: readResources(value, id), value };
}

function readNodes(document: PreparedDocument, allowInstances: boolean): SceneNode[] {
  const nodes = new Map<string, SceneNode>();
  for (const raw of document.nodes) {
    const id = asId(raw.id, "SCENE_ID_UNSTABLE", `${document.id} has a node without a stable id`, nodeIdPattern);
    if (nodes.has(id)) fail("SCENE_ID_UNSTABLE", `${document.id} declares node ${id} twice`);
    const node: SceneNode = { id };
    if (raw.parent !== undefined) node.parent = asId(raw.parent, "SCENE_REFERENCE_NOT_FOUND", `${document.id}.${id} parent is invalid`, nodeIdPattern);
    if (raw.prefab !== undefined) {
      if (!allowInstances) fail("SCENE_SCHEMA_INVALID", `${document.id}.${id} cannot instantiate a prefab`);
      node.prefab = asId(raw.prefab, "SCENE_REFERENCE_NOT_FOUND", `${document.id}.${id} prefab is invalid`);
    }
    if (raw.components !== undefined) node.components = object(raw.components, "SCENE_SCHEMA_INVALID", `${document.id}.${id} components must be an object`);
    if (raw.parameters !== undefined) {
      const parameters = object(raw.parameters, "SCENE_SCHEMA_INVALID", `${document.id}.${id} parameters must be an object`);
      node.parameters = Object.fromEntries(Object.entries(parameters).map(([key, value]) => [
        asId(key, "SCENE_SCHEMA_INVALID", `${document.id}.${id} parameter id is invalid`, nodeIdPattern),
        primitive(value, "SCENE_SCHEMA_INVALID", `${document.id}.${id} parameter ${key} is not a primitive`)
      ]));
    }
    if (raw.overrides !== undefined) {
      node.overrides = array(raw.overrides, "SCENE_SCHEMA_INVALID", `${document.id}.${id} overrides must be an array`).map((value) => {
        const override = object(value, "SCENE_SCHEMA_INVALID", `${document.id}.${id} override must be an object`);
        return {
          id: asId(override.id, "PREFAB_OVERRIDE_FORBIDDEN", `${document.id}.${id} override id is invalid`, nodeIdPattern),
          value: primitive(override.value, "PREFAB_OVERRIDE_FORBIDDEN", `${document.id}.${id} override value is not a primitive`)
        };
      });
    }
    if (raw.slots !== undefined) {
      node.slots = array(raw.slots, "SCENE_SCHEMA_INVALID", `${document.id}.${id} slots must be an array`).map((value) => {
        const slot = object(value, "SCENE_SCHEMA_INVALID", `${document.id}.${id} slot must be an object`);
        return {
          id: asId(slot.id, "PREFAB_SLOT_UNRESOLVED", `${document.id}.${id} slot id is invalid`, nodeIdPattern),
          prefab: asId(slot.prefab, "PREFAB_SLOT_UNRESOLVED", `${document.id}.${id} slot prefab is invalid`)
        };
      });
    }
    nodes.set(id, node);
  }
  const root = nodes.get(document.root);
  if (root === undefined) fail("SCENE_REFERENCE_NOT_FOUND", `${document.id} root ${document.root} is not a node`);
  if (root.parent !== undefined) fail("SCENE_REFERENCE_CYCLE", `${document.id} root ${document.root} cannot have a parent`);
  for (const node of nodes.values()) {
    if (node.id !== document.root && node.parent === undefined) {
      fail("SCENE_REFERENCE_NOT_FOUND", `${document.id}.${node.id} has no parent`);
    }
    if (node.parent !== undefined && !nodes.has(node.parent)) {
      fail("SCENE_REFERENCE_NOT_FOUND", `${document.id}.${node.id} parent ${node.parent} is not declared`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail("SCENE_REFERENCE_CYCLE", `${document.id} node parent cycle reaches ${id}`);
    visiting.add(id);
    const parent = nodes.get(id)?.parent;
    if (parent !== undefined) visit(parent);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of nodes.keys()) visit(id);
  return [...nodes.values()].sort(compareById);
}

function validateComponents(owner: string, components: Record<string, unknown> | undefined, resources: ReadonlySet<string>): void {
  if (components === undefined) return;
  for (const [name, raw] of Object.entries(components)) {
    if (!componentNames.has(name)) fail("SCENE_COMPONENT_UNSUPPORTED", `${owner} component ${name} is not public`);
    const component = object(raw, "SCENE_SCHEMA_INVALID", `${owner} component ${name} must be an object`);
    const resourceField = name === "visual" || name === "audioEmitter" || name === "vfxEmitter"
      ? "resource"
      : name === "animation" ? "controller" : name === "navigation" ? "region" : undefined;
    if (resourceField !== undefined) {
      const resource = asId(component[resourceField], "SCENE_REFERENCE_NOT_FOUND", `${owner} ${name} resource is invalid`);
      if (!resources.has(resource)) fail("SCENE_REFERENCE_NOT_FOUND", `${owner} ${name} references unknown resource ${resource}`);
    }
  }
}

function readPrefabMetadata(document: PreparedDocument): Pick<PrefabDocument, "parameters" | "overrides" | "slots"> & { base?: string } {
  const parameters = array(document.value.parameters, "SCENE_SCHEMA_INVALID", `${document.id} parameters must be an array`).map((value) => {
    const parameter = object(value, "SCENE_SCHEMA_INVALID", `${document.id} parameter must be an object`);
    const id = asId(parameter.id, "SCENE_ID_UNSTABLE", `${document.id} parameter has no stable id`, nodeIdPattern);
    const type = string(parameter.type, "SCENE_SCHEMA_INVALID", `${document.id} parameter ${id} has no type`) as PrefabParameter["type"];
    if (!(["string", "integer", "number", "boolean"] as const).includes(type)) {
      fail("SCENE_SCHEMA_INVALID", `${document.id} parameter ${id} has unsupported type ${type}`);
    }
    const defaultValue = primitive(parameter.default, "SCENE_SCHEMA_INVALID", `${document.id} parameter ${id} has no primitive default`);
    if (!typedValue(type, defaultValue)) fail("SCENE_SCHEMA_INVALID", `${document.id} parameter ${id} default has incompatible type`);
    return { id, type, default: defaultValue };
  });
  if (new Set(parameters.map(({ id }) => id)).size !== parameters.length) fail("SCENE_ID_UNSTABLE", `${document.id} repeats a parameter id`);

  const overrides = array(document.value.overrides, "SCENE_SCHEMA_INVALID", `${document.id} overrides must be an array`).map((value) => {
    const override = object(value, "SCENE_SCHEMA_INVALID", `${document.id} override must be an object`);
    const id = asId(override.id, "SCENE_ID_UNSTABLE", `${document.id} override has no stable id`, nodeIdPattern);
    const target = asId(override.target, "SCENE_REFERENCE_NOT_FOUND", `${document.id} override ${id} target is invalid`, nodeIdPattern);
    const path = string(override.path, "SCENE_SCHEMA_INVALID", `${document.id} override ${id} has no path`);
    if (!path.startsWith("/")) fail("SCENE_SCHEMA_INVALID", `${document.id} override ${id} path is not a JSON pointer`);
    const type = string(override.type, "SCENE_SCHEMA_INVALID", `${document.id} override ${id} has no type`) as PrefabOverride["type"];
    if (!(["string", "integer", "number", "boolean"] as const).includes(type)) {
      fail("SCENE_SCHEMA_INVALID", `${document.id} override ${id} has unsupported type ${type}`);
    }
    return { id, target, path, type };
  });
  if (new Set(overrides.map(({ id }) => id)).size !== overrides.length) fail("SCENE_ID_UNSTABLE", `${document.id} repeats an override id`);

  const slots = array(document.value.slots, "SCENE_SCHEMA_INVALID", `${document.id} slots must be an array`).map((value) => {
    const slot = object(value, "SCENE_SCHEMA_INVALID", `${document.id} slot must be an object`);
    const id = asId(slot.id, "SCENE_ID_UNSTABLE", `${document.id} slot has no stable id`, nodeIdPattern);
    if (typeof slot.required !== "boolean") fail("SCENE_SCHEMA_INVALID", `${document.id} slot ${id} required must be boolean`);
    return { id, required: slot.required };
  });
  if (new Set(slots.map(({ id }) => id)).size !== slots.length) fail("SCENE_ID_UNSTABLE", `${document.id} repeats a slot id`);

  const base = document.value.base === undefined
    ? undefined
    : asId(document.value.base, "SCENE_REFERENCE_NOT_FOUND", `${document.id} base is invalid`);
  const metadata: Pick<PrefabDocument, "parameters" | "overrides" | "slots"> & { base?: string } = {
    parameters: parameters.sort(compareById),
    overrides: overrides.sort(compareById),
    slots: slots.sort(compareById)
  };
  if (base !== undefined) metadata.base = base;
  return metadata;
}

function validatePrefabBases(prefabs: readonly PrefabDocument[], prefabsById: ReadonlyMap<string, PrefabDocument>): void {
  for (const prefab of prefabs) {
    if (prefab.base !== undefined && !prefabsById.has(prefab.base)) {
      fail("SCENE_REFERENCE_NOT_FOUND", `${prefab.id} base ${prefab.base} is not declared`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail("SCENE_REFERENCE_CYCLE", `prefab base cycle reaches ${id}`);
    visiting.add(id);
    const base = prefabsById.get(id)?.base;
    if (base !== undefined) visit(base);
    visiting.delete(id);
    visited.add(id);
  };
  for (const prefab of prefabs) visit(prefab.id);
}

function validatePrefabInstance(scene: SceneGraphDocument, node: SceneNode, prefabs: ReadonlyMap<string, PrefabDocument>): void {
  const owner = `${scene.id}.${node.id}`;
  if (node.prefab === undefined) {
    if (node.parameters !== undefined || node.overrides !== undefined || node.slots !== undefined) {
      fail("SCENE_SCHEMA_INVALID", `${owner} has prefab bindings without a prefab`);
    }
    return;
  }
  const prefab = prefabs.get(node.prefab);
  if (prefab === undefined) fail("SCENE_REFERENCE_NOT_FOUND", `${owner} references unknown prefab ${node.prefab}`);
  const parameters = new Map(prefab.parameters.map((parameter) => [parameter.id, parameter]));
  for (const [id, value] of Object.entries(node.parameters ?? {})) {
    const parameter = parameters.get(id);
    if (parameter === undefined || !typedValue(parameter.type, value)) {
      fail("SCENE_SCHEMA_INVALID", `${owner} parameter ${id} is not declared by ${prefab.id}`);
    }
  }
  const overrideDefinitions = new Map(prefab.overrides.map((override) => [override.id, override]));
  const appliedOverrides = new Set<string>();
  for (const override of node.overrides ?? []) {
    const definition = overrideDefinitions.get(override.id);
    if (definition === undefined || appliedOverrides.has(override.id) || !typedValue(definition.type, override.value)) {
      fail("PREFAB_OVERRIDE_FORBIDDEN", `${owner} override ${override.id} is not allowed by ${prefab.id}`);
    }
    appliedOverrides.add(override.id);
  }
  const slotDefinitions = new Map(prefab.slots.map((slot) => [slot.id, slot]));
  const filledSlots = new Set<string>();
  for (const slot of node.slots ?? []) {
    if (!slotDefinitions.has(slot.id) || filledSlots.has(slot.id) || !prefabs.has(slot.prefab)) {
      fail("PREFAB_SLOT_UNRESOLVED", `${owner} slot ${slot.id} is not resolved`);
    }
    filledSlots.add(slot.id);
  }
  for (const slot of prefab.slots) {
    if (slot.required && !filledSlots.has(slot.id)) fail("PREFAB_SLOT_UNRESOLVED", `${owner} must fill slot ${slot.id}`);
  }
}

function orderedNodes(nodes: readonly SceneNode[]): SceneNode[] {
  return nodes.map((node) => {
    const ordered = clone(node);
    if (ordered.overrides !== undefined) ordered.overrides = [...ordered.overrides].sort(compareById);
    if (ordered.slots !== undefined) ordered.slots = [...ordered.slots].sort(compareById);
    return ordered;
  }).sort(compareById);
}

/**
 * Compiles the authored scene/prefab sources to a graph whose identity uses only
 * explicit IDs. No renderer class, callback or inline expression can enter this
 * representation: hosts consume semantic components and references only.
 */
export function compileSceneGraph(input: {
  scenes: readonly SceneGraphSource[];
  prefabs: readonly SceneGraphSource[];
}): CompiledSceneGraph {
  const rawScenes = input.scenes.map((source) => readDocument(source, SCENE_SCHEMA_ID, "scene"));
  const rawPrefabs = input.prefabs.map((source) => readDocument(source, PREFAB_SCHEMA_ID, "prefab"));
  const allIds = [...rawScenes, ...rawPrefabs].map(({ id }) => id);
  if (new Set(allIds).size !== allIds.length) fail("SCENE_ID_UNSTABLE", "scene and prefab document IDs must be globally unique");

  const resources = new Map<string, SceneResource>();
  for (const document of [...rawScenes, ...rawPrefabs]) {
    for (const resource of document.resources) {
      if (resources.has(resource.id)) fail("SCENE_ID_UNSTABLE", `resource ${resource.id} is declared more than once`);
      resources.set(resource.id, resource);
    }
  }

  const prefabs = rawPrefabs.map((document) => {
    const metadata = readPrefabMetadata(document);
    const nodes = readNodes(document, false);
    const nodeIds = new Set(nodes.map(({ id }) => id));
    const rawNodesById = new Map(document.nodes.map((node) => [node.id as string, node]));
    for (const override of metadata.overrides) {
      if (!nodeIds.has(override.target)) fail("SCENE_REFERENCE_NOT_FOUND", `${document.id} override ${override.id} target ${override.target} is not declared`);
      const target = rawNodesById.get(override.target);
      const targetValue = target === undefined ? undefined : valueAtPointer(target, override.path);
      if (targetValue === undefined || (typeof targetValue !== "string" && typeof targetValue !== "number" && typeof targetValue !== "boolean") || !typedValue(override.type, targetValue)) {
        fail("PREFAB_OVERRIDE_FORBIDDEN", `${document.id} override ${override.id} does not mark a compatible field`);
      }
    }
    for (const node of nodes) validateComponents(`${document.id}.${node.id}`, node.components, new Set(resources.keys()));
    return {
      id: document.id,
      root: document.root,
      nodes: orderedNodes(nodes),
      resources: [...document.resources].sort(compareById),
      ...metadata
    };
  }).sort(compareById);
  const prefabsById = new Map(prefabs.map((prefab) => [prefab.id, prefab]));
  validatePrefabBases(prefabs, prefabsById);

  const scenes = rawScenes.map((document) => {
    const nodes = readNodes(document, true);
    for (const node of nodes) validateComponents(`${document.id}.${node.id}`, node.components, new Set(resources.keys()));
    const scene: SceneGraphDocument = {
      id: document.id,
      root: document.root,
      nodes: orderedNodes(nodes),
      resources: [...document.resources].sort(compareById)
    };
    for (const node of scene.nodes) validatePrefabInstance(scene, node, prefabsById);
    return scene;
  }).sort(compareById);

  const graph: SceneGraph = {
    graphVersion: SCENE_GRAPH_VERSION,
    scenes,
    prefabs,
    resources: [...resources.values()].sort(compareById)
  };
  const encoded = canonicalJson(graph);
  const bytes = new TextEncoder().encode(encoded);
  return { graph, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
