export function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function pathLeaf(p: string): string {
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const last = trimmed.lastIndexOf("/");
  return last === -1 ? trimmed : trimmed.slice(last + 1) || "/";
}
