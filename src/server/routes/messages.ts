import type { Rotom } from "../../session-manager.js";

interface Ctx {
  rotom: Rotom;
}

export async function handleSendMessage(
  req: Request,
  ctx: Ctx,
  params: { id: string },
): Promise<Response> {
  const session = ctx.rotom.get(params.id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!body.text || typeof body.text !== "string") {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  session.send(body.text);
  return new Response(null, { status: 202 });
}
