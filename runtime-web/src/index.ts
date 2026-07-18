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

const ok = 0;
const configSize = 24;
const inputSize = 24;

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
  throw new Error(`${operation} failed: ${detail}`);
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
