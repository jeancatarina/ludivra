import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RepositoryFingerprint } from "./generated/operability.js";

function git(directory: string, arguments_: string[]): string | undefined {
  const execution = spawnSync("git", ["-C", directory, ...arguments_], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return execution.status === 0 ? execution.stdout : undefined;
}

export async function repositoryFingerprint(directory: string): Promise<RepositoryFingerprint> {
  const repositoryRoot = git(directory, ["rev-parse", "--show-toplevel"])?.trim();
  if (repositoryRoot === undefined || repositoryRoot.length === 0) {
    return { commit: null, dirty: null, worktreeHash: null };
  }

  const commit = git(repositoryRoot, ["rev-parse", "HEAD"])?.trim() ?? null;
  const status = git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) ?? "";
  const diff = git(repositoryRoot, ["diff", "--binary", "HEAD"]) ?? "";
  const hash = createHash("sha256");
  hash.update(commit ?? "unborn");
  hash.update("\0");
  hash.update(status);
  hash.update("\0");
  hash.update(diff);

  for (const line of status.split("\n").filter((value) => value.startsWith("?? ")).sort()) {
    const relativePath = line.slice(3);
    const content = await readFile(resolve(repositoryRoot, relativePath)).catch(() => undefined);
    if (content !== undefined) {
      hash.update("\0untracked\0");
      hash.update(relativePath);
      hash.update("\0");
      hash.update(content);
    }
  }

  return {
    commit: commit !== null && /^[a-f0-9]{40}$/.test(commit) ? commit : null,
    dirty: status.length > 0,
    worktreeHash: hash.digest("hex")
  };
}

export function repositoriesMatch(left: RepositoryFingerprint, right: RepositoryFingerprint): boolean {
  return left.commit === right.commit && left.dirty === right.dirty && left.worktreeHash === right.worktreeHash;
}
