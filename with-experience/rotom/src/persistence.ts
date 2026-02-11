import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionMeta } from "./types.js";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function saveMeta(
  dataDir: string,
  meta: SessionMeta,
): Promise<void> {
  await ensureDir(dataDir);
  await writeFile(
    join(dataDir, `${meta.id}.json`),
    JSON.stringify(meta),
  );
}

export async function loadAllMeta(dataDir: string): Promise<SessionMeta[]> {
  await ensureDir(dataDir);
  const results: SessionMeta[] = [];
  try {
    const files = await readdir(dataDir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(dataDir, f), "utf-8");
        results.push(JSON.parse(raw));
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // directory doesn't exist yet — that's fine
  }
  return results;
}

export async function deleteMeta(
  dataDir: string,
  id: string,
): Promise<void> {
  try {
    await rm(join(dataDir, `${id}.json`));
  } catch {
    // file already gone — that's fine
  }
}
