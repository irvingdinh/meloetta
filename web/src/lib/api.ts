import type {
  AppConfig,
  BrowseResult,
  CLIType,
  DiffResult,
  SessionDetail,
  SessionInfo,
} from "./types";

const BASE = "/api";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function listSessions(): Promise<SessionInfo[]> {
  return json<SessionInfo[]>(`${BASE}/sessions`);
}

export async function createSession(
  cwd: string,
  cli: CLIType,
): Promise<SessionInfo> {
  return json<SessionInfo>(`${BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd, cli }),
  });
}

export async function getSession(id: string): Promise<SessionDetail> {
  return json<SessionDetail>(`${BASE}/sessions/${id}`);
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
}

export async function sendMessage(id: string, text: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
}

export async function getDiff(id: string): Promise<DiffResult> {
  return json<DiffResult>(`${BASE}/sessions/${id}/diff`);
}

export async function browse(path?: string): Promise<BrowseResult> {
  const params = path ? `?path=${encodeURIComponent(path)}` : "";
  return json<BrowseResult>(`${BASE}/browse${params}`);
}

export async function getConfig(): Promise<AppConfig> {
  return json<AppConfig>(`${BASE}/config`);
}

export async function patchConfig(
  update: Partial<AppConfig>,
): Promise<AppConfig> {
  return json<AppConfig>(`${BASE}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}
