import { spawn, type Subprocess } from "bun";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import index from "./index.html";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "8090");
const DATA_DIR = join(homedir(), ".meloetta", "sessions");
const DEFAULTS_FILE = join(homedir(), ".meloetta", "defaults.json");

let defaults = { cwd: homedir(), cli: "claude" as CLIType };

async function loadDefaults() {
  try {
    const raw = await readFile(DEFAULTS_FILE, "utf-8");
    const d = JSON.parse(raw);
    if (d.cwd) defaults.cwd = d.cwd;
    if (d.cli) defaults.cli = d.cli;
  } catch {}
}

async function saveDefaults() {
  await writeFile(DEFAULTS_FILE, JSON.stringify(defaults));
}

// --- Types ---

type CLIType = "claude" | "codex";

interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  cwd: string;
  cli: CLIType;
  cliSessionId: string | null; // claude session_id or codex thread_id
  model: string | null;
  messages: { role: "user" | "assistant"; text: string }[];
}

type Emitter = (event: string, data?: any) => void;

interface Adapter {
  send(text: string): void;
  kill(): void;
}

interface Session extends SessionMeta {
  adapter: Adapter | null;
  subscribers: Set<ServerWebSocket<WsData>>;
  ready: boolean;
  lastActivity: number;
  buffer: string;
}

interface WsData {
  sessionId?: string;
}

type ServerWebSocket<T> = import("bun").ServerWebSocket<T>;

const sessions = new Map<string, Session>();

function genId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// --- Persistence ---

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function saveMeta(session: Session) {
  const meta: SessionMeta = {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    cwd: session.cwd,
    cli: session.cli,
    cliSessionId: session.cliSessionId,
    model: session.model,
    messages: session.messages,
  };
  await writeFile(join(DATA_DIR, `${session.id}.json`), JSON.stringify(meta));
}

async function loadSessions() {
  await ensureDataDir();
  try {
    const files = await readdir(DATA_DIR);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(DATA_DIR, f), "utf-8");
        const meta: SessionMeta = JSON.parse(raw);
        sessions.set(meta.id, {
          ...meta,
          cli: meta.cli || "claude",
          model: meta.model || null,
          adapter: null,
          subscribers: new Set(),
          ready: false,
          lastActivity: Date.now(),
          buffer: "",
        });
      } catch {}
    }
  } catch {}
}

async function deleteMeta(id: string) {
  try {
    await rm(join(DATA_DIR, `${id}.json`));
  } catch {}
}

// --- Stream reader helper ---

function readLines(
  proc: Subprocess,
  onLine: (line: string) => void,
  onEnd?: () => void
) {
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let partial = "";

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const lines = partial.split("\n");
        partial = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          onLine(line);
        }
      }
    } catch {}
    onEnd?.();
  })();
}

// --- Claude Adapter ---

function summarizeClaudeTool(name: string, input: any): string {
  if (!input) return name;
  if (name === "Bash" && input.description) return `${name}: ${input.description}`;
  if (name === "Bash" && input.command) return `${name}: ${input.command.slice(0, 80)}`;
  if (name === "Read" && input.file_path) return `${name}: ${input.file_path}`;
  if (name === "Edit" && input.file_path) return `${name}: ${input.file_path}`;
  if (name === "Write" && input.file_path) return `${name}: ${input.file_path}`;
  if (name === "Grep" && input.pattern) return `${name}: ${input.pattern}`;
  if (name === "Glob" && input.pattern) return `${name}: ${input.pattern}`;
  if (name === "WebSearch" && input.query) return `${name}: ${input.query}`;
  if (name === "WebFetch" && input.url) return `${name}: ${input.url}`;
  if (name === "Task" && input.description) return `${name}: ${input.description}`;
  return name;
}

function createClaudeAdapter(session: Session, emit: Emitter): Adapter {
  const args = [
    "claude",
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  if (session.cliSessionId) {
    args.push("--resume", session.cliSessionId);
  }

  const proc = spawn(args, {
    cwd: session.cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  readLines(proc, (line) => {
    try {
      const data = JSON.parse(line);

      if (data.type === "system" && data.subtype === "init") {
        if (data.session_id && !session.cliSessionId) {
          session.cliSessionId = data.session_id;
        }
        if (data.model) {
          session.model = data.model;
        }
        saveMeta(session);
        emit("ready");
        return;
      }

      // thinking
      if (
        data.type === "stream_event" &&
        data.event?.type === "content_block_start" &&
        data.event?.content_block?.type === "thinking"
      ) {
        emit("activity", "thinking");
        return;
      }

      // tool use started
      if (
        data.type === "stream_event" &&
        data.event?.type === "content_block_start" &&
        data.event?.content_block?.type === "tool_use"
      ) {
        emit("activity", `using ${data.event.content_block.name}...`);
        return;
      }

      // full assistant message with tool calls
      if (data.type === "assistant" && data.message?.content) {
        for (const block of data.message.content) {
          if (block.type === "tool_use") {
            emit("activity", summarizeClaudeTool(block.name, block.input));
          }
        }
        return;
      }

      // tool result
      if (data.type === "user" && data.tool_use_result !== undefined) {
        emit("activity", "done");
        return;
      }

      // text delta
      if (
        data.type === "stream_event" &&
        data.event?.type === "content_block_delta" &&
        data.event?.delta?.type === "text_delta"
      ) {
        emit("chunk", data.event.delta.text);
        return;
      }

      // turn complete
      if (data.type === "result") {
        if (data.model) session.model = data.model;
        emit("turn_done", { costUsd: data.total_cost_usd, model: session.model });
        return;
      }
    } catch {}
  });

  return {
    send(text: string) {
      const input = JSON.stringify({
        type: "user",
        message: { role: "user", content: text },
      });
      proc.stdin.write(input + "\n");
    },
    kill() {
      try { proc.kill(); } catch {}
    },
  };
}

// --- Codex Adapter ---

function createCodexAdapter(session: Session, emit: Emitter): Adapter {
  let currentProc: Subprocess | null = null;

  function spawnTurn(text: string) {
    const args = ["codex", "exec"];

    if (session.cliSessionId) {
      // codex exec resume doesn't support -C
      args.push(
        "resume",
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        session.cliSessionId,
        text,
      );
    } else {
      args.push(
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "-C",
        session.cwd,
        text,
      );
    }

    const proc = spawn(args, {
      cwd: session.cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    currentProc = proc;

    readLines(
      proc,
      (line) => {
        try {
          const data = JSON.parse(line);

          // capture thread_id
          if (data.type === "thread.started" && data.thread_id) {
            if (!session.cliSessionId) {
              session.cliSessionId = data.thread_id;
            }
            if (data.model) {
              session.model = data.model;
            }
            saveMeta(session);
            emit("ready");
            return;
          }

          // reasoning/thinking
          if (
            data.type === "item.completed" &&
            data.item?.type === "reasoning"
          ) {
            emit("activity", `thinking: ${(data.item.text || "").slice(0, 80)}`);
            return;
          }

          // tool started
          if (
            data.type === "item.started" &&
            data.item?.type === "command_execution"
          ) {
            emit("activity", `running: ${(data.item.command || "").slice(0, 80)}`);
            return;
          }

          // tool completed
          if (
            data.type === "item.completed" &&
            data.item?.type === "command_execution"
          ) {
            const status = data.item.exit_code === 0 ? "done" : `exit ${data.item.exit_code}`;
            emit("activity", status);
            return;
          }

          // agent text message (codex sends complete text, not streamed)
          if (
            data.type === "item.completed" &&
            data.item?.type === "agent_message"
          ) {
            emit("chunk", data.item.text || "");
            return;
          }

          // turn complete
          if (data.type === "turn.completed") {
            emit("turn_done", { model: session.model });
            return;
          }
        } catch {}
      },
      () => {
        currentProc = null;
      }
    );
  }

  // codex is ready immediately (process spawns per-turn)
  emit("ready");

  return {
    send(text: string) {
      spawnTurn(text);
    },
    kill() {
      try { currentProc?.kill(); } catch {}
    },
  };
}

// --- Session management ---

function createAdapter(session: Session): Adapter {
  const emit: Emitter = (event, data) => {
    switch (event) {
      case "ready":
        session.ready = true;
        broadcast(session, { type: "ready" });
        break;
      case "activity":
        broadcast(session, { type: "activity", activity: data });
        break;
      case "chunk":
        session.buffer += data;
        broadcast(session, { type: "chunk", text: data });
        break;
      case "turn_done":
        if (session.buffer) {
          session.messages.push({ role: "assistant", text: session.buffer });
          if (!session.title) {
            const firstUser = session.messages.find((m) => m.role === "user");
            session.title = firstUser?.text.slice(0, 80) || "Untitled";
          }
          session.buffer = "";
          saveMeta(session);
        }
        broadcast(session, { type: "done", costUsd: data?.costUsd, model: data?.model });
        break;
    }
  };

  if (session.cli === "codex") {
    return createCodexAdapter(session, emit);
  }
  return createClaudeAdapter(session, emit);
}

async function createSession(cwd: string, cli: CLIType): Promise<Session> {
  const id = genId();

  const session: Session = {
    id,
    title: "",
    createdAt: Date.now(),
    cwd,
    cli,
    cliSessionId: null,
    model: null,
    messages: [],
    adapter: null,
    subscribers: new Set(),
    ready: false,
    lastActivity: Date.now(),
    buffer: "",
  };

  sessions.set(id, session);
  session.adapter = createAdapter(session);
  await saveMeta(session);
  defaults = { cwd, cli };
  saveDefaults();
  return session;
}

function ensureAdapter(session: Session) {
  if (!session.adapter) {
    session.adapter = createAdapter(session);
  }
  // for claude, check if the underlying process died
  if (session.cli === "claude") {
    // adapter is recreated if needed on send — we just ensure it exists
  }
}

function sendMessage(session: Session, text: string) {
  if (!session.adapter) {
    session.adapter = createAdapter(session);
  }
  session.lastActivity = Date.now();
  session.messages.push({ role: "user", text });
  saveMeta(session);
  session.adapter.send(text);
}

function sessionInfo(s: Session) {
  return {
    id: s.id,
    title: s.title || "New session",
    createdAt: s.createdAt,
    cwd: s.cwd,
    cli: s.cli,
    messageCount: s.messages.length,
    alive: s.adapter !== null,
  };
}

async function destroySession(session: Session) {
  session.adapter?.kill();
  for (const ws of session.subscribers) {
    ws.send(JSON.stringify({ type: "closed" }));
  }
  sessions.delete(session.id);
  await deleteMeta(session.id);
}

function broadcast(session: Session, msg: object) {
  const payload = JSON.stringify(msg);
  for (const ws of session.subscribers) {
    ws.send(payload);
  }
}

// --- Folder browsing ---

async function browsePath(dirPath: string): Promise<{ path: string; entries: { name: string; isDir: boolean }[] }> {
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
      } catch {}
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch {}
  return { path: dirPath, entries };
}

// --- Server ---

await loadDefaults();
await loadSessions();
console.log(`loaded ${sessions.size} saved session(s)`);

Bun.serve({
  hostname: HOST,
  port: PORT,
  routes: {
    "/": index,
  },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: {} as WsData })) return;
      return new Response("upgrade failed", { status: 400 });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws: ServerWebSocket<WsData>) {},
    message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());

        switch (msg.type) {
          case "list": {
            ws.send(
              JSON.stringify({
                type: "sessions",
                sessions: [...sessions.values()].map(sessionInfo),
              })
            );
            break;
          }

          case "create": {
            const cwd = msg.cwd || homedir();
            const cli: CLIType = msg.cli === "codex" ? "codex" : "claude";
            createSession(cwd, cli).then((s) => {
              ws.send(JSON.stringify({ type: "created", session: sessionInfo(s) }));
            });
            break;
          }

          case "open": {
            const session = sessions.get(msg.sessionId);
            if (!session) {
              ws.send(JSON.stringify({ type: "error", message: "session not found" }));
              return;
            }
            ws.data.sessionId = msg.sessionId;
            session.subscribers.add(ws);
            ws.send(
              JSON.stringify({
                type: "history",
                messages: session.messages,
                ready: session.ready,
                cwd: session.cwd,
                cli: session.cli,
                title: session.title,
                model: session.model,
              })
            );
            break;
          }

          case "message": {
            const session = sessions.get(msg.sessionId);
            if (!session) {
              ws.send(JSON.stringify({ type: "error", message: "session not found" }));
              return;
            }
            sendMessage(session, msg.text);
            break;
          }

          case "delete": {
            const session = sessions.get(msg.sessionId);
            if (session) destroySession(session);
            ws.send(JSON.stringify({ type: "deleted", sessionId: msg.sessionId }));
            break;
          }

          case "leave": {
            const session = sessions.get(msg.sessionId);
            if (session) {
              session.subscribers.delete(ws);
              ws.data.sessionId = undefined;
              if (session.subscribers.size === 0) {
                session.adapter?.kill();
                session.adapter = null;
                session.ready = false;
              }
            }
            break;
          }

          case "browse": {
            const dir = msg.path || defaults.cwd;
            browsePath(dir).then((result) => {
              ws.send(JSON.stringify({ type: "browse_result", ...result, defaults }));
            });
            break;
          }
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "invalid message" }));
      }
    },
    close(ws: ServerWebSocket<WsData>) {
      if (ws.data.sessionId) {
        const session = sessions.get(ws.data.sessionId);
        if (session) {
          session.subscribers.delete(ws);
          if (session.subscribers.size === 0) {
            session.adapter?.kill();
            session.adapter = null;
            session.ready = false;
          }
        }
      }
    },
  },
});

// --- Idle session cleanup (5 min) ---

const IDLE_TIMEOUT = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (!session.adapter) continue;
    if (now - session.lastActivity > IDLE_TIMEOUT) {
      console.log(`killing idle session ${session.id} (${session.cli})`);
      session.adapter.kill();
      session.adapter = null;
      session.ready = false;
      broadcast(session, { type: "idle" });
    }
  }
}, 60_000);

console.log(`meloetta running at http://${HOST}:${PORT}`);
