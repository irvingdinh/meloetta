import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { CLIType, SessionMeta } from "./types.js";

const MELOETTA_DIR = join(homedir(), ".meloetta");
const CONFIG_FILE = join(MELOETTA_DIR, "config.json");
const LEGACY_DEFAULTS_FILE = join(MELOETTA_DIR, "defaults.json");

export interface AppConfig {
  cwd: string;
  cli: CLIType;
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function loadConfig(): Promise<AppConfig> {
  const config: AppConfig = { cwd: homedir(), cli: "claude" };

  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const d = JSON.parse(raw);
    if (d.cwd) config.cwd = d.cwd;
    if (d.cli) config.cli = d.cli;
    return config;
  } catch {
    // config.json not found, try legacy
  }

  // Migrate from legacy defaults.json if it exists
  try {
    const raw = await readFile(LEGACY_DEFAULTS_FILE, "utf-8");
    const d = JSON.parse(raw);
    if (d.cwd) config.cwd = d.cwd;
    if (d.cli) config.cli = d.cli;
    await saveConfig(config);
    await rm(LEGACY_DEFAULTS_FILE).catch(() => {});
    return config;
  } catch {
    // legacy not found either, use defaults
  }

  return config;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureDir(MELOETTA_DIR);
  await writeFile(CONFIG_FILE, JSON.stringify(config));
}

export async function saveMeta(
  dataDir: string,
  meta: SessionMeta,
): Promise<void> {
  await ensureDir(dataDir);
  await writeFile(join(dataDir, `${meta.id}.json`), JSON.stringify(meta));
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

export async function deleteMeta(dataDir: string, id: string): Promise<void> {
  try {
    await rm(join(dataDir, `${id}.json`));
  } catch {
    // file already gone — that's fine
  }
}
