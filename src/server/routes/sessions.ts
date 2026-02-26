import { homedir } from "node:os";

import type { Rotom } from "../../session-manager.js";
import type { CLIType } from "../../types.js";
import type { SSEManager } from "../sse.js";
import { isGitRepo } from "./diff.js";

interface Ctx {
  rotom: Rotom;
  sse: SSEManager;
  config: { cwd: string; cli: CLIType };
  saveConfig: () => Promise<void>;
}

export async function handleListSessions(
  _req: Request,
  ctx: Ctx,
): Promise<Response> {
  return Response.json(ctx.rotom.list());
}

export async function handleCreateSession(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  const body = await req.json();
  const cwd = body.cwd || homedir();
  const cli: CLIType = body.cli === "codex" ? "codex" : "claude";

  const session = await ctx.rotom.create({ cwd, cli });
  ctx.sse.wireSession(session);
  ctx.config.cwd = cwd;
  ctx.config.cli = cli;
  await ctx.saveConfig();

  return Response.json(session.info(), { status: 201 });
}

export async function handleGetSession(
  _req: Request,
  ctx: Ctx,
  params: { id: string },
): Promise<Response> {
  const session = ctx.rotom.get(params.id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  const isGit = await isGitRepo(session.cwd);
  return Response.json({
    ...session.info(),
    messages: session.messages,
    isGit,
  });
}

export async function handleDeleteSession(
  _req: Request,
  ctx: Ctx,
  params: { id: string },
): Promise<Response> {
  const session = ctx.rotom.get(params.id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  ctx.sse.closeSession(params.id);
  await ctx.rotom.destroy(params.id);
  return new Response(null, { status: 204 });
}
