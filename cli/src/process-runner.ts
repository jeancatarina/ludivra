import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface ProcessResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
}

export interface ProcessOptions {
  /** Stable id used in diagnostics and in the live child table. */
  id: string;
  cwd: string;
  /** Milliseconds, or an explicit declaration that this child has no deadline. */
  timeoutMs: number | "unbounded";
  env?: NodeJS.ProcessEnv;
  interactive?: boolean;
  /** Grace period between SIGTERM and SIGKILL. */
  killGraceMs?: number;
}

interface TrackedChild {
  id: string;
  child: ChildProcess;
  killGraceMs: number;
}

const defaultKillGraceMs = 3_000;
const children = new Map<number, TrackedChild>();
let signalsInstalled = false;
let interruptHandler: (() => void) | null = null;

/**
 * Lets a long-running command stop gracefully on SIGINT instead of exiting, so a
 * watch session can still write its run manifest. Children are terminated first.
 */
export function setInterruptHandler(handler: (() => void) | null): void {
  interruptHandler = handler;
}

/**
 * Sole owner of process creation in the CLI. Every child declares a deadline, runs
 * in its own process group and is terminated when the CLI exits, so no invocation
 * can leave an orphan holding a port.
 */
function register(id: string, child: ChildProcess, killGraceMs: number): void {
  if (child.pid === undefined) return;
  children.set(child.pid, { id, child, killGraceMs });
  child.once("exit", () => {
    if (child.pid !== undefined) children.delete(child.pid);
  });
}

function signal(child: ChildProcess, value: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    // Negative pid targets the whole group, so grandchildren die with the child.
    process.kill(-child.pid, value);
  } catch {
    try {
      child.kill(value);
    } catch {
      // The child already exited; nothing owns it anymore.
    }
  }
}

/** SIGTERM, then SIGKILL after the declared grace period. */
export function terminate(child: ChildProcess, killGraceMs = defaultKillGraceMs): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const escalation = setTimeout(() => signal(child, "SIGKILL"), killGraceMs);
    child.once("exit", () => {
      clearTimeout(escalation);
      resolve();
    });
    signal(child, "SIGTERM");
  });
}

export function liveChildren(): string[] {
  return [...children.values()].map(({ id }) => id);
}

/** Terminates every tracked child. Called on normal exit and on received signals. */
export async function terminateAllChildren(): Promise<string[]> {
  const tracked = [...children.values()];
  await Promise.all(tracked.map(({ child, killGraceMs }) => terminate(child, killGraceMs)));
  return tracked.map(({ id }) => id);
}

/**
 * Installs the shutdown hooks once. Without them an interrupted CLI leaves build
 * tools and dev servers running.
 */
export function installProcessLifecycle(): void {
  if (signalsInstalled) return;
  signalsInstalled = true;
  for (const received of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(received, () => {
      const handler = interruptHandler;
      void terminateAllChildren().finally(() => {
        if (handler !== null) {
          interruptHandler = null;
          handler();
          return;
        }
        process.exit(received === "SIGINT" ? 130 : 143);
      });
    });
  }
  process.on("exit", () => {
    for (const { child } of children.values()) signal(child, "SIGKILL");
  });
}

/** Long-lived child whose streams the caller drives, such as the control worker. */
export function startChildProcess(
  command: string,
  arguments_: string[],
  options: Omit<ProcessOptions, "interactive" | "timeoutMs">
): ChildProcessWithoutNullStreams {
  installProcessLifecycle();
  const child = spawn(command, arguments_, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"]
  }) as ChildProcessWithoutNullStreams;
  register(options.id, child, options.killGraceMs ?? defaultKillGraceMs);
  return child;
}

export async function runProcess(
  command: string,
  arguments_: string[],
  options: ProcessOptions
): Promise<ProcessResult> {
  installProcessLifecycle();
  const killGraceMs = options.killGraceMs ?? defaultKillGraceMs;
  return new Promise((resolve, reject) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: options.interactive === true ? "inherit" : ["ignore", "pipe", "pipe"]
    });
    register(options.id, child, killGraceMs);
    if (options.interactive !== true) {
      child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    }
    const deadline = options.timeoutMs === "unbounded"
      ? undefined
      : setTimeout(() => {
        timedOut = true;
        output += `\nRUNNER_CHILD_TIMEOUT: ${options.id} exceeded ${String(options.timeoutMs)}ms\n`;
        void terminate(child, killGraceMs);
      }, options.timeoutMs);
    child.once("error", (error) => {
      if (deadline !== undefined) clearTimeout(deadline);
      reject(error);
    });
    child.once("exit", (code) => {
      if (deadline !== undefined) clearTimeout(deadline);
      resolve({ exitCode: timedOut ? 124 : code ?? 1, output, timedOut });
    });
  });
}
