import { homedir } from "node:os";
import { join } from "node:path";

import { loadConfig, saveConfig as persistConfig } from "../persistence.js";
import { Rotom } from "../session-manager.js";
import { handleBrowse } from "./routes/browse.js";
import { handleGetConfig, handlePatchConfig } from "./routes/config.js";
import { handleGetDiff } from "./routes/diff.js";
import { handleSendMessage } from "./routes/messages.js";
import {
  handleCreateSession,
  handleDeleteSession,
  handleGetSession,
  handleListSessions,
} from "./routes/sessions.js";
import { SSEManager } from "./sse.js";
import { handleStatic } from "./static.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "16480");
const DATA_DIR =
  process.env.MELOETTA_DATA_DIR || join(homedir(), ".meloetta", "sessions");

const rotom = new Rotom({ dataDir: DATA_DIR });
const sse = new SSEManager();
const config = await loadConfig();

const ctx = {
  rotom,
  sse,
  config,
  saveConfig: () => persistConfig(config),
};

await rotom.load();

for (const info of rotom.list()) {
  const session = rotom.get(info.id);
  if (session) sse.wireSession(session);
}

console.log(`loaded ${rotom.list().length} saved session(s)`);

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    try {
      const url = new URL(req.url);
      const segments = url.pathname.split("/");
      const method = req.method;

      if (segments[1] === "api") {
        if (segments[2] === "sessions") {
          const id = segments[3];

          if (id) {
            switch (segments[4]) {
              case "events":
                if (method === "GET") {
                  const session = rotom.get(id);
                  if (!session) {
                    return Response.json(
                      { error: "session not found" },
                      { status: 404 },
                    );
                  }
                  return sse.connect(session.id);
                }
                break;
              case "messages":
                if (method === "POST")
                  return handleSendMessage(req, ctx, { id });
                break;
              case "diff":
                if (method === "GET") return handleGetDiff(req, ctx, { id });
                break;
              default:
                if (!segments[4]) {
                  if (method === "GET")
                    return handleGetSession(req, ctx, { id });
                  if (method === "DELETE")
                    return handleDeleteSession(req, ctx, { id });
                }
            }
          } else {
            if (method === "GET") return handleListSessions(req, ctx);
            if (method === "POST") return handleCreateSession(req, ctx);
          }
        }

        if (segments[2] === "browse" && method === "GET") {
          return handleBrowse(req, ctx);
        }

        if (segments[2] === "config") {
          if (method === "GET") return handleGetConfig(req, ctx);
          if (method === "PATCH") return handlePatchConfig(req, ctx);
        }

        return Response.json({ error: "not found" }, { status: 404 });
      }

      const staticResponse = await handleStatic(req);
      return staticResponse ?? new Response("not found", { status: 404 });
    } catch (err) {
      console.error("request error:", err);
      return Response.json({ error: "internal server error" }, { status: 500 });
    }
  },
});

function shutdown() {
  console.log("\nshutting down...");
  rotom.close();
  sse.closeAll();
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`meloetta running at http://${HOST}:${PORT}`);
