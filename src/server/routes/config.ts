import type { AppConfig } from "../../persistence.js";

export async function handleGetConfig(
  _req: Request,
  ctx: { config: AppConfig },
): Promise<Response> {
  return Response.json(ctx.config);
}

export async function handlePatchConfig(
  req: Request,
  ctx: { config: AppConfig; saveConfig: () => Promise<void> },
): Promise<Response> {
  const body = await req.json();
  if (body.cwd !== undefined) ctx.config.cwd = body.cwd;
  if (body.cli !== undefined) ctx.config.cli = body.cli;
  await ctx.saveConfig();
  return Response.json(ctx.config);
}
