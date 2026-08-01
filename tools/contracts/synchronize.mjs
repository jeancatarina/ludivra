import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDirectory, "../..");
const scripts = [
  "tools/contracts/generate-cli-result.mjs",
  "tools/contracts/generate-control.mjs",
  "tools/contracts/generate-desktop-host.mjs",
  "tools/contracts/generate-presentation-events.mjs",
  "tools/contracts/generate-lua-sdk.mjs",
  "tools/contracts/generate-ui-inspection-projector.mjs",
  "tools/contracts/generate-operability.mjs",
  "tools/contracts/generate-capabilities.mjs",
  "tools/contracts/generate-ui.mjs",
  "tools/program-status/generate.mjs"
];
const checkOnly = process.argv.includes("--check");

function execute(script, check) {
  return new Promise((resolveExecution) => {
    const child = spawn(process.execPath, [resolve(root, script), ...(check ? ["--check"] : [])], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      resolveExecution({ script, status: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (status) => {
      resolveExecution({ script, status, stdout, stderr });
    });
  });
}

function reportFailures(failures) {
  if (failures.length === 0) return;
  for (const failure of failures) {
    process.stderr.write(
      `${failure.script} failed${failure.status === null ? "" : ` with exit ${failure.status}`}\n` +
      failure.stdout +
      failure.stderr
    );
  }
  process.exitCode = 1;
}

const checks = await Promise.all(scripts.map((script) => execute(script, true)));
const stale = checks.filter(({ status }) => status !== 0);
if (checkOnly) {
  reportFailures(stale);
} else if (stale.length > 0) {
  const generated = await Promise.all(stale.map(({ script }) => execute(script, false)));
  reportFailures(generated.filter(({ status }) => status !== 0));
}
