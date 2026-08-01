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
const statechartTraceSize = 36;

function call(
  module: RuntimeModule,
  name: string,
  arguments_: number[] = []
): number {
  return module.ccall(name, "number", arguments_.map(() => "number"), arguments_) as number;
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

  destroy(): void {
    if (this.handle !== 0) {
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
