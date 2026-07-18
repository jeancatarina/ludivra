import { spawn } from "node:child_process";

export interface ProcessResult {
  exitCode: number;
  output: string;
}

export async function runProcess(
  command: string,
  arguments_: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; interactive?: boolean }
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.interactive ? "inherit" : ["ignore", "pipe", "pipe"]
    });
    if (!options.interactive) {
      child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    }
    child.once("error", reject);
    child.once("exit", (code) => resolve({ exitCode: code ?? 1, output }));
  });
}
