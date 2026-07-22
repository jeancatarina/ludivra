import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface, type Interface } from "node:readline";
import { resolve } from "node:path";
import { createContractValidator } from "./contract-validator.js";
import {
  CONTROL_PROTOCOL_VERSION,
  type ControlOperation,
  type ControlPayload,
  type ControlRequest,
  type ControlResponse
} from "./generated/control-protocol.js";

export interface ControlCommandRecord {
  requestId: number;
  operation: ControlOperation;
  payload: ControlPayload;
  status: ControlResponse["status"];
  durationMs: number;
  diagnostic?: ControlResponse["diagnostic"];
}

export class LocalControlClient {
  static async start(engineRoot: string, project: string, timeoutMs: number): Promise<LocalControlClient> {
    const token = randomBytes(32).toString("hex");
    const workerEnvironment: NodeJS.ProcessEnv = {
      LUDIVRA_CONTROL_TOKEN: token,
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TMPDIR: process.env.TMPDIR,
      TMP: process.env.TMP,
      TEMP: process.env.TEMP
    };
    const child = spawn(process.execPath, [resolve(engineRoot, "cli/dist/control-worker.js"), "--project", project, "--engine-root", engineRoot], {
      cwd: engineRoot,
      env: workerEnvironment,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const schema = JSON.parse(await readFile(resolve(engineRoot, "contracts/control-protocol.schema.json"), "utf8"));
    const client = new LocalControlClient(child, token, timeoutMs, createContractValidator().compile(schema));
    try {
      await client.request("health", {});
      return client;
    } catch {
      child.kill("SIGTERM");
      throw new Error("CONTROL_WORKER_START_FAILED");
    }
  }

  readonly commands: ControlCommandRecord[] = [];
  private readonly lines: Interface;
  private readonly pending = new Map<number, {
    accept: (response: ControlResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private requestSequence = 0;
  private stderr = "";
  private exited = false;

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly validate: ReturnType<ReturnType<typeof createContractValidator>["compile"]>
  ) {
    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.lines.on("line", (line) => {
      try {
        const response = JSON.parse(line) as ControlResponse;
        const pending = this.pending.get(response.requestId);
        if (pending !== undefined) {
          this.pending.delete(response.requestId);
          clearTimeout(pending.timer);
          pending.accept(response);
        }
      } catch {
        this.stderr += `\nInvalid worker response: ${line}`;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { this.stderr += chunk.toString(); });
    child.once("exit", () => {
      this.exited = true;
      for (const [requestId, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`CONTROL_WORKER_EXITED:${requestId}:${this.stderr.trim()}`));
      }
      this.pending.clear();
    });
  }

  async request(operation: ControlOperation, payload: ControlPayload): Promise<ControlResponse> {
    if (this.exited) throw new Error(`CONTROL_WORKER_EXITED:${this.stderr.trim()}`);
    this.requestSequence += 1;
    const request: ControlRequest = {
      protocolVersion: CONTROL_PROTOCOL_VERSION,
      requestId: this.requestSequence,
      token: this.token,
      operation,
      payload
    };
    if (!this.validate(request)) throw new Error("CONTROL_REQUEST_INVALID");
    const startedAt = performance.now();
    const responsePromise = new Promise<ControlResponse>((accept, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(new Error(`CONTROL_TIMEOUT:${operation}`));
      }, this.timeoutMs);
      this.pending.set(request.requestId, { accept, reject, timer });
    });
    this.child.stdin.write(`${JSON.stringify(request)}\n`);
    const response = await responsePromise;
    if (!this.validate(response) || response.requestId !== request.requestId) throw new Error("CONTROL_RESPONSE_INVALID");
    const recordedPayload = operation === "verify_replay" && typeof payload.archiveBase64 === "string"
      ? {
          archiveBytes: Buffer.from(payload.archiveBase64, "base64").byteLength,
          archiveSha256: createHash("sha256").update(Buffer.from(payload.archiveBase64, "base64")).digest("hex")
        }
      : payload;
    const record: ControlCommandRecord = {
      requestId: request.requestId,
      operation,
      payload: recordedPayload,
      status: response.status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    };
    if (response.diagnostic !== undefined) record.diagnostic = response.diagnostic;
    this.commands.push(record);
    return response;
  }

  async close(): Promise<void> {
    if (this.exited) return;
    try {
      await this.request("shutdown", {});
    } catch {
      // The process is force-terminated below when graceful shutdown is unavailable.
    }
    this.child.stdin.end();
    this.lines.close();
    if (!this.exited) {
      const exitedCleanly = await new Promise<boolean>((accept) => {
        const timer = setTimeout(() => accept(false), 500);
        this.child.once("exit", () => {
          clearTimeout(timer);
          accept(true);
        });
      });
      if (!exitedCleanly && !this.exited) this.child.kill("SIGTERM");
    }
  }
}
