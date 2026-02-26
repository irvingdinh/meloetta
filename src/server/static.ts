import { join, resolve } from "node:path";

const STATIC_ROOT = resolve(join(import.meta.dir, "../../dist/web"));

export async function handleStatic(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const filePath = resolve(STATIC_ROOT, url.pathname.slice(1));

  if (!filePath.startsWith(STATIC_ROOT)) {
    return new Response("forbidden", { status: 403 });
  }

  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }

  // SPA fallback: serve index.html for non-API, non-file routes
  const indexFile = Bun.file(join(STATIC_ROOT, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile);
  }

  return null;
}
