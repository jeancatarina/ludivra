import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { optionValue } from "../arguments.js";
import { hashArtifactPath } from "../artifact-hash.js";
import { resolveProjectDirectory } from "../project.js";
import type { CommandContext, CommandOutcome } from "../result.js";

async function optionalJson(path: string): Promise<unknown> {
  return readFile(path, "utf8").then(JSON.parse).catch(() => null);
}

export async function runReport(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  const project = await resolveProjectDirectory(arguments_);
  const sourceRun = optionValue(arguments_, "--run");
  if (sourceRun === undefined || !/^run_[a-f0-9-]+$/.test(sourceRun)) {
    return { diagnostics: [{ code: "REPORT_RUN_REQUIRED", severity: "error", message: "Use --run <run-id>" }], nextActions: ["Run game simulate to create source evidence"] };
  }
  const sourceDirectory = resolve(project, "reports/runs", sourceRun);
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(resolve(sourceDirectory, "manifest.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return { diagnostics: [{ code: "REPORT_SOURCE_NOT_FOUND", severity: "error", message: `Run manifest not found: ${sourceRun}` }], nextActions: ["Choose a run listed by game status"] };
  }
  const [diagnostics, metrics, logical] = await Promise.all([
    optionalJson(resolve(sourceDirectory, "diagnostics.json")),
    optionalJson(resolve(sourceDirectory, "metrics.json")),
    optionalJson(resolve(sourceDirectory, "logical-state.json"))
  ]);
  const runDirectory = resolve(project, "reports/runs", context.runId);
  const summaryPath = resolve(runDirectory, "summary.md");
  await mkdir(runDirectory, { recursive: true });
  await writeFile(summaryPath, `# Evidence report\n\n- Source run: ${sourceRun}\n- Operation: ${String(manifest.operation ?? "unknown")}\n- Status: ${String(manifest.status ?? "unknown")}\n- Commit: ${String((manifest.repositories as { engine?: { commit?: string } } | undefined)?.engine?.commit ?? "unknown")}\n\n## Diagnostics\n\n\`\`\`json\n${JSON.stringify(diagnostics, null, 2)}\n\`\`\`\n\n## Metrics\n\n\`\`\`json\n${JSON.stringify(metrics, null, 2)}\n\`\`\`\n\n## Logical state\n\n\`\`\`json\n${JSON.stringify(logical, null, 2)}\n\`\`\`\n`, "utf8");
  return {
    diagnostics: [],
    artifacts: [{ kind: "evidence-report", path: summaryPath, sha256: await hashArtifactPath(summaryPath) }],
    data: { project, sourceRun, summary: summaryPath },
    nextActions: ["Review the report together with screenshots and causal trace from the source run"]
  };
}
