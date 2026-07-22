import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { resolve } from "node:path";

export function sha256(data: string | NodeJS.ArrayBufferView): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function hashArtifactPath(path: string): Promise<string> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    return sha256(`link\0${await readlink(path)}`);
  }
  if (stat.isFile()) {
    return sha256(await readFile(path));
  }
  if (!stat.isDirectory()) {
    return sha256(`special\0${stat.mode}\0${stat.size}`);
  }

  const hash = createHash("sha256");
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = resolve(path, entry.name);
    hash.update(entry.isDirectory() ? "directory\0" : entry.isSymbolicLink() ? "link\0" : "file\0");
    hash.update(entry.name);
    hash.update("\0");
    hash.update(await hashArtifactPath(child));
    hash.update("\0");
  }
  return hash.digest("hex");
}
