import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { CLIType } from "../../types.js";

interface Ctx {
  config: { cwd: string; cli: CLIType };
}

async function browsePath(
  dirPath: string,
): Promise<{ path: string; entries: { name: string; isDir: boolean }[] }> {
  const entries: { name: string; isDir: boolean }[] = [];
  try {
    const items = await readdir(dirPath);
    for (const name of items) {
      if (name.startsWith(".")) continue;
      try {
        const s = await stat(join(dirPath, name));
        if (s.isDirectory()) {
          entries.push({ name, isDir: true });
        }
      } catch {
        // stat failed, skip entry
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // readdir failed
  }
  return { path: dirPath, entries };
}

export async function handleBrowse(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const dir = url.searchParams.get("path") || ctx.config.cwd;
  const result = await browsePath(dir);
  return Response.json({ ...result, config: ctx.config });
}
