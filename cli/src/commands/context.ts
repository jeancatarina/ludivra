import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { optionValue } from "../arguments.js";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";

interface Capability {
  id: string;
  status: string;
  version: string;
  owner: string;
  targets: string[];
  contracts: string[];
  examples: string[];
  verification: string[];
  limitations: Array<{ code: string; message: string }>;
}

function tokens(value: string): string[] {
  return [...new Set(value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((token) => token.length >= 3))];
}

export async function runContext(arguments_: string[]): Promise<CommandOutcome> {
  const task = optionValue(arguments_, "--task");
  if (task === undefined || task.trim().length === 0) {
    return {
      diagnostics: [{ code: "CONTEXT_TASK_REQUIRED", severity: "error", message: "Use game context --task <description>" }],
      nextActions: ["Describe the change or problem in --task"]
    };
  }
  const root = await findEngineRoot();
  const catalog = JSON.parse(await readFile(resolve(root, "CAPABILITIES.json"), "utf8")) as { capabilities: Capability[] };
  const taskTokens = tokens(task);
  const matches = catalog.capabilities.map((capability) => {
    const fields = [capability.id, capability.owner, ...capability.contracts, ...capability.examples, ...capability.verification, ...capability.limitations.flatMap(({ code, message }) => [code, message])];
    const searchable = tokens(fields.join(" "));
    const matchedTokens = taskTokens.filter((token) => searchable.some((candidate) => candidate.includes(token) || token.includes(candidate)));
    return { capability, score: matchedTokens.length, matchedTokens };
  }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || left.capability.id.localeCompare(right.capability.id));
  return {
    diagnostics: [],
    data: {
      task,
      method: "deterministic-token-match-v1",
      confidence: matches.length === 0 ? "INCONCLUSIVE" : "MATCHED",
      sources: ["CAPABILITIES.json"],
      matches: matches.slice(0, 5).map(({ capability, score, matchedTokens }) => ({
        id: capability.id,
        status: capability.status,
        version: capability.version,
        owner: capability.owner,
        score,
        matchedTokens,
        contracts: capability.contracts,
        examples: capability.examples,
        verification: capability.verification,
        limitations: capability.limitations
      }))
    },
    nextActions: matches.length === 0 ? ["Inspect CAPABILITIES.json and report the missing capability as INCONCLUSIVE"] : [`Inspect capability ${matches[0]?.capability.id}`]
  };
}
