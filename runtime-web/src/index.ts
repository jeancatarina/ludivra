import {
  PRESENTATION_EVENT_RECORD_SIZE,
  PRESENTATION_EVENT_TYPES,
  type PresentationEvent
} from "./generated/presentation-events.js";

export type {
  AudioPlayEvent,
  AudioStopEvent,
  EffectSpawnEvent,
  PresentationEvent
} from "./generated/presentation-events.js";
export {
  installCompiledStatechart,
  type CompiledStatechartDocument,
  type InstalledStatechartNames,
  type StatechartManifestDeclaration,
  type StatechartRuntimeInstaller
} from "./statechart.js";

export interface RuntimeModule {
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  UTF8ToString(pointer: number): string;
  ccall(
    name: string,
    returnType: "number" | "string" | null,
    argumentTypes: Array<"number" | "string">,
    arguments_: Array<number | string>
  ): number | string | null;
}

export type RuntimeModuleFactory = (
  options?: Record<string, unknown>
) => Promise<RuntimeModule>;

export interface RuntimeConfiguration {
  tickRateHz: number;
  maxPendingInputs: number;
  seed: bigint;
}

export interface LogicalInput {
  actionId: number;
  valueMilli: number;
  sequence: bigint;
}

export interface StatechartState { id: number; parentId?: number; shallowHistory?: boolean; }
export interface StatechartTransition {
  id: number;
  fromState: number;
  eventActionId?: number;
  afterTicks?: number;
  toState: number;
  priority: number;
  kind: "external" | "internal";
  guardId?: number;
}
export interface StatechartHandler { id: number; name: string; }
export interface StatechartActionBinding {
  ownerId: number;
  actionId: number;
  phase: "entry" | "exit" | "transition";
}
export interface StatechartInstallOptions {
  guards?: readonly StatechartHandler[];
  actions?: readonly StatechartHandler[];
  bindings?: readonly StatechartActionBinding[];
}
export interface StatechartTrace {
  kind: "event" | "guard" | "action";
  tick: bigint;
  eventActionId: number;
  transitionId: number;
  guardId: number;
  actionId: number;
  previousState: number;
  activeState: number;
  guardPassed: boolean;
  actionPhase?: "exit" | "transition" | "entry";
  error: number;
}

const ok = 0;
const configSize = 24;
const inputSize = 24;
const statechartStateSize = 12;
const statechartTransitionSize = 32;
const statechartActionSize = 12;
const spatialWorldConfigurationSize = 12;
const spatialPositionSize = 32;
const spatialOffsetSize = 32;
const spatialRegionSize = 16;
const spatialLocationSize = 48;
const networkRoomConfigurationSize = 56;
const networkPeerHelloSize = 40;
const networkInputSize = 24;
// `ludivra_statechart_trace` contains a uint64_t and is therefore padded to the
// public C ABI record size. Reading 36 bytes desynchronizes every trace after
// the first record.
const statechartTraceSize = 40;

function call(
  module: RuntimeModule,
  name: string,
  arguments_: number[] = []
): number {
  return module.ccall(name, "number", arguments_.map(() => "number"), arguments_) as number;
}

/** WASM wrapper for the kernel's LoopbackRoom. Transport adapters pass it only
 * logical input and snapshots; they never receive a mutable state surface. */
export class LudivraNetworkRoom {
  static create(module: RuntimeModule, hostHandle: number, configuration: NetworkRoomConfiguration, onDestroy?: () => void): LudivraNetworkRoom {
    const generator = new TextEncoder().encode(configuration.world.generatorId);
    if (generator.length === 0 || generator.length > 128) throw new NetworkFailure("network generator id must contain 1 through 128 UTF-8 bytes");
    const configPointer = module._malloc(networkRoomConfigurationSize);
    const outputPointer = module._malloc(4);
    const generatorPointer = module._malloc(generator.length);
    try {
      module.HEAPU8.fill(0, configPointer, configPointer + networkRoomConfigurationSize);
      module.HEAPU8.set(generator, generatorPointer);
      const view = new DataView(module.HEAPU8.buffer);
      view.setUint32(configPointer, networkRoomConfigurationSize, true);
      view.setUint32(configPointer + 4, configuration.tickRateHz, true);
      view.setUint32(configPointer + 8, configuration.maxPendingInputs, true);
      view.setBigUint64(configPointer + 16, configuration.seed, true);
      view.setUint32(configPointer + 24, configuration.protocolVersion, true);
      view.setUint32(configPointer + 28, configuration.maximumClients, true);
      view.setUint32(configPointer + 32, configuration.maximumInputsPerClient, true);
      view.setUint32(configPointer + 36, generatorPointer, true);
      view.setUint32(configPointer + 40, generator.length, true);
      view.setUint32(configPointer + 44, configuration.world.generatorVersion, true);
      view.setBigUint64(configPointer + 48, configuration.world.contentHash, true);
      requireNetworkOk(module, "network room creation", call(module, "ludivra_network_room_create", [hostHandle, configPointer, outputPointer]));
      const handle = module.HEAPU32[outputPointer >>> 2];
      if (handle === undefined || handle === 0) throw new NetworkFailure("network room creation returned an empty handle");
      return new LudivraNetworkRoom(module, handle, onDestroy);
    } finally {
      module._free(generatorPointer);
      module._free(outputPointer);
      module._free(configPointer);
    }
  }

  private constructor(
    private readonly module: RuntimeModule,
    private handle: number,
    private readonly onDestroy?: () => void
  ) {}

  connect(hello: NetworkPeerHello): number {
    const generator = new TextEncoder().encode(hello.world.generatorId);
    if (generator.length === 0 || generator.length > 128) throw new NetworkFailure("network generator id must contain 1 through 128 UTF-8 bytes");
    const helloPointer = this.module._malloc(networkPeerHelloSize);
    const outputPointer = this.module._malloc(4);
    const generatorPointer = this.module._malloc(generator.length);
    try {
      this.module.HEAPU8.fill(0, helloPointer, helloPointer + networkPeerHelloSize);
      this.module.HEAPU8.set(generator, generatorPointer);
      const view = new DataView(this.module.HEAPU8.buffer);
      view.setUint32(helloPointer, networkPeerHelloSize, true);
      view.setUint32(helloPointer + 4, hello.protocolVersion, true);
      view.setUint32(helloPointer + 8, generatorPointer, true);
      view.setUint32(helloPointer + 12, generator.length, true);
      view.setUint32(helloPointer + 16, hello.world.generatorVersion, true);
      view.setBigUint64(helloPointer + 24, hello.world.seed, true);
      view.setBigUint64(helloPointer + 32, hello.world.contentHash, true);
      requireNetworkOk(this.module, "network peer connect", call(this.module, "ludivra_network_room_connect", [this.liveHandle(), helloPointer, outputPointer]));
      return new DataView(this.module.HEAPU8.buffer).getUint32(outputPointer, true);
    } finally {
      this.module._free(generatorPointer);
      this.module._free(outputPointer);
      this.module._free(helloPointer);
    }
  }

  submitInput(clientId: number, input: LogicalInput): void {
    const pointer = this.module._malloc(networkInputSize);
    try {
      this.module.HEAPU8.fill(0, pointer, pointer + networkInputSize);
      const view = new DataView(this.module.HEAPU8.buffer);
      view.setUint32(pointer, networkInputSize, true);
      view.setUint32(pointer + 4, input.actionId, true);
      view.setInt32(pointer + 8, input.valueMilli, true);
      view.setBigUint64(pointer + 16, input.sequence, true);
      requireNetworkOk(this.module, "network input", call(this.module, "ludivra_network_room_submit_input", [this.liveHandle(), clientId, pointer]));
    } finally { this.module._free(pointer); }
  }

  rejectClientState(clientId: number): void {
    requireNetworkOk(this.module, "network client-state rejection", call(this.module, "ludivra_network_room_reject_client_state", [this.liveHandle(), clientId]));
  }

  advance(): NetworkRoomSnapshot {
    requireNetworkOk(this.module, "network room advance", call(this.module, "ludivra_network_room_advance", [this.liveHandle()]));
    return this.snapshot();
  }

  snapshot(): NetworkRoomSnapshot {
    const sizePointer = this.module._malloc(4);
    try {
      requireNetworkOk(this.module, "network snapshot size", call(this.module, "ludivra_network_room_snapshot_size", [this.liveHandle(), sizePointer]));
      const size = new DataView(this.module.HEAPU8.buffer).getUint32(sizePointer, true);
      const archivePointer = this.module._malloc(size);
      const tickPointer = this.module._malloc(8);
      const hashPointer = this.module._malloc(8);
      try {
        requireNetworkOk(this.module, "network snapshot write", call(this.module, "ludivra_network_room_snapshot_write", [
          this.liveHandle(), archivePointer, size, tickPointer, hashPointer
        ]));
        const view = new DataView(this.module.HEAPU8.buffer);
        return { tick: view.getBigUint64(tickPointer, true), stateHash: view.getBigUint64(hashPointer, true),
          archive: this.module.HEAPU8.slice(archivePointer, archivePointer + size) };
      } finally {
        this.module._free(hashPointer);
        this.module._free(tickPointer);
        this.module._free(archivePointer);
      }
    } finally { this.module._free(sizePointer); }
  }

  destroy(): void {
    if (this.handle === 0) return;
    call(this.module, "ludivra_network_room_destroy", [this.handle]);
    this.handle = 0;
    this.onDestroy?.();
  }

  private liveHandle(): number {
    if (this.handle === 0) throw new NetworkFailure("network room has been destroyed");
    return this.handle;
  }
}

function requireOk(module: RuntimeModule, operation: string, result: number, handle?: number): void {
  if (result === ok) {
    return;
  }
  const message = module.ccall(
    "ludivra_result_message",
    "string",
    ["number"],
    [result]
  ) as string;
  const runtimeDetail = handle === undefined
    ? ""
    : module.UTF8ToString(call(module, "ludivra_runtime_last_error", [handle]));
  const detail = runtimeDetail.length > 0 ? `${message}: ${runtimeDetail}` : message;
  const failure = new RuntimeFailure(`${operation} failed: ${detail}`);
  // A stable code lets a caller diagnose by code instead of matching on prose.
  const code = handle === undefined
    ? ""
    : module.UTF8ToString(call(module, "ludivra_runtime_last_error_code", [handle]));
  if (code.length > 0) failure.code = code;
  throw failure;
}

/** Failure carrying the stable code the kernel reported, when there is one. */
export class RuntimeFailure extends Error {
  code?: string;
}

export interface NetworkWorldIdentity {
  seed: bigint;
  generatorId: string;
  generatorVersion: number;
  contentHash: bigint;
}

export interface NetworkRoomConfiguration extends RuntimeConfiguration {
  protocolVersion: number;
  maximumClients: number;
  maximumInputsPerClient: number;
  world: NetworkWorldIdentity;
}

export interface NetworkPeerHello {
  protocolVersion: number;
  world: NetworkWorldIdentity;
}

export interface NetworkRoomSnapshot {
  tick: bigint;
  stateHash: bigint;
  archive: Uint8Array;
}

/** Failure returned by the authoritative network-room boundary. */
export class NetworkFailure extends Error {}

function requireNetworkOk(module: RuntimeModule, operation: string, result: number): void {
  if (result === ok) return;
  const message = module.ccall("ludivra_network_result_message", "string", ["number"], [result]) as string;
  throw new NetworkFailure(`${operation} failed: ${message}`);
}

export interface SpatialWorldConfiguration {
  dimension: number;
  regionExtentChunks: number;
}

export interface SpatialGlobalPosition {
  dimension: number;
  xMilli: bigint;
  yMilli: bigint;
  zMilli: bigint;
}

export interface SpatialOffset {
  xMilli: bigint;
  yMilli: bigint;
  zMilli: bigint;
}

export interface SpatialRegion {
  dimension: number;
  x: number;
  y: number;
  z: number;
}

export interface SpatialLocation {
  entityId: number;
  region: SpatialRegion;
  position: SpatialGlobalPosition;
}

/** Failure returned by the independent semantic spatial boundary. */
export class SpatialFailure extends Error {}

function requireSpatialOk(module: RuntimeModule, operation: string, result: number): void {
  if (result === ok) return;
  const message = module.ccall("ludivra_spatial_result_message", "string", ["number"], [result]) as string;
  throw new SpatialFailure(`${operation} failed: ${message}`);
}

/**
 * Public spatial consumer surface. It takes global fixed-point positions and
 * region queries; chunk/local packing remains inside the kernel.
 */
export class LudivraSpatialWorld {
  static create(module: RuntimeModule, configuration: SpatialWorldConfiguration): LudivraSpatialWorld {
    const configPointer = module._malloc(spatialWorldConfigurationSize);
    const outputPointer = module._malloc(4);
    try {
      module.HEAPU8.fill(0, configPointer, configPointer + spatialWorldConfigurationSize);
      const view = new DataView(module.HEAPU8.buffer);
      view.setUint32(configPointer, spatialWorldConfigurationSize, true);
      view.setUint16(configPointer + 4, configuration.dimension, true);
      view.setUint32(configPointer + 8, configuration.regionExtentChunks, true);
      requireSpatialOk(module, "spatial world creation", call(module, "ludivra_spatial_world_create", [configPointer, outputPointer]));
      const handle = module.HEAPU32[outputPointer >>> 2];
      if (handle === undefined || handle === 0) throw new Error("spatial world creation returned an empty handle");
      return new LudivraSpatialWorld(module, handle);
    } finally {
      module._free(outputPointer);
      module._free(configPointer);
    }
  }

  private constructor(private readonly module: RuntimeModule, private handle: number) {}

  put(entityId: number, position: SpatialGlobalPosition): void {
    const pointer = this.module._malloc(spatialPositionSize);
    try {
      const view = new DataView(this.module.HEAPU8.buffer);
      this.module.HEAPU8.fill(0, pointer, pointer + spatialPositionSize);
      view.setUint32(pointer, spatialPositionSize, true);
      view.setUint16(pointer + 4, position.dimension, true);
      view.setBigInt64(pointer + 8, position.xMilli, true);
      view.setBigInt64(pointer + 16, position.yMilli, true);
      view.setBigInt64(pointer + 24, position.zMilli, true);
      requireSpatialOk(this.module, "spatial entity placement", call(this.module, "ludivra_spatial_world_put", [this.liveHandle(), entityId, pointer]));
    } finally {
      this.module._free(pointer);
    }
  }

  translate(entityId: number, offset: SpatialOffset): void {
    const pointer = this.module._malloc(spatialOffsetSize);
    try {
      const view = new DataView(this.module.HEAPU8.buffer);
      this.module.HEAPU8.fill(0, pointer, pointer + spatialOffsetSize);
      view.setUint32(pointer, spatialOffsetSize, true);
      view.setBigInt64(pointer + 8, offset.xMilli, true);
      view.setBigInt64(pointer + 16, offset.yMilli, true);
      view.setBigInt64(pointer + 24, offset.zMilli, true);
      requireSpatialOk(this.module, "spatial entity translation", call(this.module, "ludivra_spatial_world_translate", [this.liveHandle(), entityId, pointer]));
    } finally {
      this.module._free(pointer);
    }
  }

  locate(entityId: number): SpatialLocation {
    const pointer = this.module._malloc(spatialLocationSize);
    try {
      const view = new DataView(this.module.HEAPU8.buffer);
      this.module.HEAPU8.fill(0, pointer, pointer + spatialLocationSize);
      view.setUint32(pointer, spatialLocationSize, true);
      requireSpatialOk(this.module, "spatial location inspection", call(this.module, "ludivra_spatial_world_locate", [this.liveHandle(), entityId, pointer]));
      const dimension = view.getUint16(pointer + 8, true);
      return {
        entityId: view.getUint32(pointer + 4, true),
        region: {
          dimension,
          x: view.getInt32(pointer + 12, true),
          y: view.getInt32(pointer + 16, true),
          z: view.getInt32(pointer + 20, true)
        },
        position: {
          dimension,
          xMilli: view.getBigInt64(pointer + 24, true),
          yMilli: view.getBigInt64(pointer + 32, true),
          zMilli: view.getBigInt64(pointer + 40, true)
        }
      };
    } finally {
      this.module._free(pointer);
    }
  }

  entitiesIn(region: SpatialRegion): number[] {
    const regionPointer = this.module._malloc(spatialRegionSize);
    const countPointer = this.module._malloc(4);
    try {
      this.writeRegion(regionPointer, region);
      requireSpatialOk(this.module, "spatial region count", call(this.module, "ludivra_spatial_world_entities_in_count", [this.liveHandle(), regionPointer, countPointer]));
      const count = new DataView(this.module.HEAPU8.buffer).getUint32(countPointer, true);
      if (count === 0) return [];
      const entitiesPointer = this.module._malloc(count * 4);
      try {
        requireSpatialOk(this.module, "spatial region read", call(this.module, "ludivra_spatial_world_entities_in_write", [
          this.liveHandle(), regionPointer, entitiesPointer, count, countPointer
        ]));
        const written = new DataView(this.module.HEAPU8.buffer).getUint32(countPointer, true);
        return Array.from(this.module.HEAPU32.slice(entitiesPointer >>> 2, (entitiesPointer >>> 2) + written));
      } finally {
        this.module._free(entitiesPointer);
      }
    } finally {
      this.module._free(countPointer);
      this.module._free(regionPointer);
    }
  }

  destroy(): void {
    if (this.handle === 0) return;
    call(this.module, "ludivra_spatial_world_destroy", [this.handle]);
    this.handle = 0;
  }

  private writeRegion(pointer: number, region: SpatialRegion): void {
    const view = new DataView(this.module.HEAPU8.buffer);
    this.module.HEAPU8.fill(0, pointer, pointer + spatialRegionSize);
    view.setUint16(pointer, region.dimension, true);
    view.setInt32(pointer + 4, region.x, true);
    view.setInt32(pointer + 8, region.y, true);
    view.setInt32(pointer + 12, region.z, true);
  }

  private liveHandle(): number {
    if (this.handle === 0) throw new Error("spatial world has been destroyed");
    return this.handle;
  }
}

export class LudivraRuntime {
  static async create(
    factory: RuntimeModuleFactory,
    configuration: RuntimeConfiguration,
    moduleOptions?: Record<string, unknown>
  ): Promise<LudivraRuntime> {
    const module = await factory(moduleOptions);
    const configPointer = module._malloc(configSize);
    const outputPointer = module._malloc(4);
    try {
      module.HEAPU8.fill(0, configPointer, configPointer + configSize);
      const view = new DataView(module.HEAPU8.buffer);
      view.setUint32(configPointer, configSize, true);
      view.setUint32(configPointer + 4, configuration.tickRateHz, true);
      view.setUint32(configPointer + 8, configuration.maxPendingInputs, true);
      view.setBigUint64(configPointer + 16, configuration.seed, true);
      const result = call(module, "ludivra_runtime_create", [configPointer, outputPointer]);
      requireOk(module, "runtime creation", result);
      const handle = module.HEAPU32[outputPointer >>> 2];
      if (handle === undefined || handle === 0) {
        throw new Error("runtime creation returned an empty handle");
      }
      return new LudivraRuntime(module, handle);
    } finally {
      module._free(outputPointer);
      module._free(configPointer);
    }
  }

  private constructor(
    private readonly module: RuntimeModule,
    private handle: number
  ) {}

  private readonly networkRooms = new Set<LudivraNetworkRoom>();

  /**
   * Declares the semantic name of a state or timer before gameplay loads. It is
   * what lets a script use `ctx.state:get("energy")` or
   * `ctx.timers:start("attack.windup", 12)` instead of repeating manifest keys.
   */
  declareSymbol(kind: "state" | "timer", name: string, key: number): void {
    const bytes = new TextEncoder().encode(name);
    const pointer = this.module._malloc(bytes.length);
    try {
      this.module.HEAPU8.set(bytes, pointer);
      requireOk(
        this.module,
        "state symbol declaration",
        call(this.module, "ludivra_runtime_declare_symbol", [
          this.liveHandle(),
          kind === "state" ? 0 : 1,
          pointer,
          bytes.length,
          key
        ]),
        this.handle
      );
    } finally {
      this.module._free(pointer);
    }
  }

  /**
   * Installs the compiled content pack. It must precede `loadGameplay`, because a
   * gameplay module may resolve `SDK.content` at load time as well as during a tick.
   */
  loadContentPack(bytes: Uint8Array): void {
    const pointer = this.module._malloc(bytes.length);
    try {
      this.module.HEAPU8.set(bytes, pointer);
      requireOk(
        this.module,
        "content pack load",
        call(this.module, "ludivra_runtime_load_content_pack", [this.liveHandle(), pointer, bytes.length]),
        this.handle
      );
    } finally {
      this.module._free(pointer);
    }
  }

  loadGameplay(source: string): void {
    const bytes = new TextEncoder().encode(source);
    const pointer = this.module._malloc(bytes.length);
    try {
      this.module.HEAPU8.set(bytes, pointer);
      requireOk(
        this.module,
        "gameplay load",
        call(this.module, "ludivra_runtime_load_gameplay", [this.liveHandle(), pointer, bytes.length]),
        this.handle
      );
    } finally {
      this.module._free(pointer);
    }
  }

  submitInput(input: LogicalInput): void {
    const pointer = this.module._malloc(inputSize);
    try {
      this.module.HEAPU8.fill(0, pointer, pointer + inputSize);
      const view = new DataView(this.module.HEAPU8.buffer);
      view.setUint32(pointer, inputSize, true);
      view.setUint32(pointer + 4, input.actionId, true);
      view.setInt32(pointer + 8, input.valueMilli, true);
      view.setBigUint64(pointer + 16, input.sequence, true);
      requireOk(
        this.module,
        "input submission",
        call(this.module, "ludivra_runtime_submit_input", [this.liveHandle(), pointer]),
        this.handle
      );
    } finally {
      this.module._free(pointer);
    }
  }

  step(tickCount: number): void {
    requireOk(
      this.module,
      "runtime step",
      call(this.module, "ludivra_runtime_step", [this.liveHandle(), tickCount]),
      this.handle
    );
  }

  private declareStatechartHandler(kind: "guard" | "action", handler: StatechartHandler): void {
    const bytes = new TextEncoder().encode(handler.name);
    const pointer = this.module._malloc(bytes.length);
    try {
      this.module.HEAPU8.set(bytes, pointer);
      requireOk(this.module, "statechart handler declaration", call(this.module, "ludivra_runtime_declare_statechart_handler", [
        this.liveHandle(), kind === "guard" ? 0 : 1, pointer, bytes.length, handler.id
      ]), this.handle);
    } finally { this.module._free(pointer); }
  }

  installStatechart(
    states: readonly StatechartState[],
    transitions: readonly StatechartTransition[],
    initialState: number,
    options: StatechartInstallOptions = {}
  ): void {
    if (states.length === 0) throw new Error("statechart requires at least one state");
    for (const handler of options.guards ?? []) this.declareStatechartHandler("guard", handler);
    for (const handler of options.actions ?? []) this.declareStatechartHandler("action", handler);
    const statesPointer = this.module._malloc(states.length * statechartStateSize);
    const transitionsPointer = transitions.length === 0 ? 0 : this.module._malloc(transitions.length * statechartTransitionSize);
    const bindings = options.bindings ?? [];
    const actionsPointer = bindings.length === 0 ? 0 : this.module._malloc(bindings.length * statechartActionSize);
    try {
      const view = new DataView(this.module.HEAPU8.buffer);
      states.forEach((state, index) => {
        const offset = statesPointer + index * statechartStateSize;
        view.setUint32(offset, state.id, true); view.setUint32(offset + 4, state.parentId ?? 0, true);
        view.setUint8(offset + 8, state.parentId === undefined ? 0 : 1); view.setUint8(offset + 9, state.shallowHistory === true ? 1 : 0);
      });
      transitions.forEach((transition, index) => {
        if ((transition.eventActionId === undefined) === (transition.afterTicks === undefined)) {
          throw new Error("statechart transition requires exactly one trigger");
        }
        const offset = transitionsPointer + index * statechartTransitionSize;
        view.setUint32(offset, transition.id, true); view.setUint32(offset + 4, transition.fromState, true);
        view.setUint32(offset + 8, transition.eventActionId ?? 0, true); view.setUint32(offset + 12, transition.toState, true);
        view.setUint32(offset + 16, transition.priority, true); view.setUint32(offset + 20, transition.guardId ?? 0, true);
        view.setUint32(offset + 24, transition.afterTicks ?? 0, true); view.setUint8(offset + 28, transition.kind === "external" ? 0 : 1);
      });
      bindings.forEach((binding, index) => {
        const offset = actionsPointer + index * statechartActionSize;
        view.setUint32(offset, binding.ownerId, true); view.setUint32(offset + 4, binding.actionId, true);
        view.setUint8(offset + 8, binding.phase === "entry" ? 0 : binding.phase === "exit" ? 1 : 2);
      });
      requireOk(this.module, "statechart installation", call(this.module, "ludivra_runtime_install_statechart", [
        this.liveHandle(), statesPointer, states.length, transitionsPointer, transitions.length, actionsPointer, bindings.length, initialState
      ]), this.handle);
    } finally {
      if (actionsPointer !== 0) this.module._free(actionsPointer);
      if (transitionsPointer !== 0) this.module._free(transitionsPointer);
      this.module._free(statesPointer);
    }
  }

  statechartActive(): number {
    const pointer = this.module._malloc(4);
    try { requireOk(this.module, "statechart inspection", call(this.module, "ludivra_runtime_statechart_active", [this.liveHandle(), pointer]), this.handle); return new DataView(this.module.HEAPU8.buffer).getUint32(pointer, true); }
    finally { this.module._free(pointer); }
  }

  drainStatechartTraces(): StatechartTrace[] {
    const countPointer = this.module._malloc(4);
    try {
      requireOk(this.module, "statechart trace count", call(this.module, "ludivra_runtime_statechart_trace_count", [this.liveHandle(), countPointer]), this.handle);
      const count = new DataView(this.module.HEAPU8.buffer).getUint32(countPointer, true);
      if (count === 0) return [];
      const bufferPointer = this.module._malloc(count * statechartTraceSize);
      try {
        requireOk(this.module, "statechart trace read", call(this.module, "ludivra_runtime_statechart_traces_write", [
          this.liveHandle(), bufferPointer, count, countPointer
        ]), this.handle);
        const written = new DataView(this.module.HEAPU8.buffer).getUint32(countPointer, true);
        const view = new DataView(this.module.HEAPU8.buffer);
        const traces: StatechartTrace[] = [];
        for (let index = 0; index < written; index += 1) {
          const offset = bufferPointer + index * statechartTraceSize;
          const kind = view.getUint8(offset + 32);
          const actionPhase = view.getUint8(offset + 34);
          if (kind > 2 || (actionPhase > 2 && actionPhase !== 255)) throw new Error("statechart trace record is invalid");
          traces.push({
            kind: kind === 0 ? "event" : kind === 1 ? "guard" : "action",
            tick: view.getBigUint64(offset, true),
            eventActionId: view.getUint32(offset + 8, true),
            transitionId: view.getUint32(offset + 12, true),
            guardId: view.getUint32(offset + 16, true),
            actionId: view.getUint32(offset + 20, true),
            previousState: view.getUint32(offset + 24, true),
            activeState: view.getUint32(offset + 28, true),
            guardPassed: view.getUint8(offset + 33) !== 0,
            ...(actionPhase === 255 ? {} : { actionPhase: actionPhase === 0 ? "exit" : actionPhase === 1 ? "transition" : "entry" }),
            error: view.getUint8(offset + 35)
          });
        }
        requireOk(this.module, "statechart trace clear", call(this.module, "ludivra_runtime_statechart_traces_clear", [this.liveHandle()]), this.handle);
        return traces;
      } finally { this.module._free(bufferPointer); }
    } finally { this.module._free(countPointer); }
  }

  tick(): bigint {
    return this.readUint64("ludivra_runtime_tick");
  }

  stateHash(): bigint {
    return this.readUint64("ludivra_runtime_state_hash");
  }

  integerState(key: number): bigint {
    const pointer = this.module._malloc(8);
    try {
      requireOk(
        this.module,
        "integer state inspection",
        call(this.module, "ludivra_runtime_integer_state", [this.liveHandle(), key, pointer]),
        this.handle
      );
      return new DataView(this.module.HEAPU8.buffer).getBigInt64(pointer, true);
    } finally {
      this.module._free(pointer);
    }
  }

  save(): Uint8Array {
    return this.readArchive("save", "ludivra_runtime_save_size", "ludivra_runtime_save_write");
  }

  loadSave(archive: Uint8Array): void {
    this.withArchive(archive, (pointer) => {
      requireOk(
        this.module,
        "save load",
        call(this.module, "ludivra_runtime_load_save", [this.liveHandle(), pointer, archive.length]),
        this.handle
      );
    });
  }

  replay(): Uint8Array {
    return this.readArchive(
      "replay",
      "ludivra_runtime_replay_size",
      "ludivra_runtime_replay_write"
    );
  }

  verifyReplay(archive: Uint8Array): void {
    this.withArchive(archive, (pointer) => {
      requireOk(
        this.module,
        "replay verification",
        call(this.module, "ludivra_runtime_verify_replay", [
          this.liveHandle(),
          pointer,
          archive.length
        ]),
        this.handle
      );
    });
  }

  drainPresentationEvents(): PresentationEvent[] {
    const countPointer = this.module._malloc(4);
    try {
      requireOk(
        this.module,
        "presentation event count",
        call(this.module, "ludivra_runtime_presentation_event_count", [
          this.liveHandle(),
          countPointer
        ]),
        this.handle
      );
      const count = new DataView(this.module.HEAPU8.buffer).getUint32(countPointer, true);
      if (count === 0) return [];
      const bufferPointer = this.module._malloc(count * PRESENTATION_EVENT_RECORD_SIZE);
      try {
        requireOk(
          this.module,
          "presentation event read",
          call(this.module, "ludivra_runtime_presentation_events_write", [
            this.liveHandle(),
            bufferPointer,
            count,
            countPointer
          ]),
          this.handle
        );
        const written = new DataView(this.module.HEAPU8.buffer).getUint32(countPointer, true);
        const view = new DataView(this.module.HEAPU8.buffer);
        const events: PresentationEvent[] = [];
        for (let index = 0; index < written; index += 1) {
          const offset = bufferPointer + index * PRESENTATION_EVENT_RECORD_SIZE;
          if (view.getUint32(offset, true) !== PRESENTATION_EVENT_RECORD_SIZE) {
            throw new Error("presentation event record size mismatch");
          }
          const type = view.getUint32(offset + 4, true);
          const id = view.getUint32(offset + 8, true);
          const value = view.getInt32(offset + 12, true);
          const sequence = view.getBigUint64(offset + 32, true);
          if (type === PRESENTATION_EVENT_TYPES.audioPlay) {
            events.push({ type: "audio-play", id, volumeMilli: value, sequence });
          } else if (type === PRESENTATION_EVENT_TYPES.audioStop) {
            events.push({ type: "audio-stop", id, sequence });
          } else if (type === PRESENTATION_EVENT_TYPES.effectSpawn) {
            events.push({
              type: "effect-spawn",
              id,
              intensityMilli: value,
              position: [
                view.getInt32(offset + 16, true) / 1000,
                view.getInt32(offset + 20, true) / 1000,
                view.getInt32(offset + 24, true) / 1000
              ],
              sequence
            });
          } else {
            throw new Error(`unknown presentation event type: ${type}`);
          }
        }
        requireOk(
          this.module,
          "presentation event clear",
          call(this.module, "ludivra_runtime_presentation_events_clear", [this.liveHandle()]),
          this.handle
        );
        return events;
      } finally {
        this.module._free(bufferPointer);
      }
    } finally {
      this.module._free(countPointer);
    }
  }

  /** Creates a host-authoritative room around this exact Runtime handle. Once
   * attached, advance the room rather than stepping this Runtime directly. */
  createNetworkRoom(configuration: NetworkRoomConfiguration): LudivraNetworkRoom {
    let room: LudivraNetworkRoom;
    room = LudivraNetworkRoom.create(this.module, this.liveHandle(), configuration, () => this.networkRooms.delete(room));
    this.networkRooms.add(room);
    return room;
  }

  destroy(): void {
    if (this.handle !== 0) {
      for (const room of this.networkRooms) room.destroy();
      call(this.module, "ludivra_runtime_destroy", [this.handle]);
      this.handle = 0;
    }
  }

  private liveHandle(): number {
    if (this.handle === 0) {
      throw new Error("runtime has been destroyed");
    }
    return this.handle;
  }

  private readUint64(operation: string): bigint {
    const pointer = this.module._malloc(8);
    try {
      requireOk(
        this.module,
        operation,
        call(this.module, operation, [this.liveHandle(), pointer]),
        this.handle
      );
      return new DataView(this.module.HEAPU8.buffer).getBigUint64(pointer, true);
    } finally {
      this.module._free(pointer);
    }
  }

  private readArchive(operation: string, sizeFunction: string, writeFunction: string): Uint8Array {
    const sizePointer = this.module._malloc(4);
    try {
      requireOk(
        this.module,
        `${operation} size`,
        call(this.module, sizeFunction, [this.liveHandle(), sizePointer]),
        this.handle
      );
      const size = new DataView(this.module.HEAPU8.buffer).getUint32(sizePointer, true);
      const archivePointer = this.module._malloc(size);
      try {
        requireOk(
          this.module,
          `${operation} write`,
          call(this.module, writeFunction, [this.liveHandle(), archivePointer, size]),
          this.handle
        );
        return this.module.HEAPU8.slice(archivePointer, archivePointer + size);
      } finally {
        this.module._free(archivePointer);
      }
    } finally {
      this.module._free(sizePointer);
    }
  }

  private withArchive(archive: Uint8Array, operation: (pointer: number) => void): void {
    if (archive.length === 0) {
      throw new Error("archive must not be empty");
    }
    const pointer = this.module._malloc(archive.length);
    try {
      this.module.HEAPU8.set(archive, pointer);
      operation(pointer);
    } finally {
      this.module._free(pointer);
    }
  }
}
