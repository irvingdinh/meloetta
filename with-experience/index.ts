import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Rotom, type Session, type CLIType } from "./rotom/src/index.js";
import index from "./index.html";

// --- Git helpers ---

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const result = await Bun.$`git -C ${cwd} rev-parse --is-inside-work-tree`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

interface DiffLine {
  type: "context" | "addition" | "deletion" | "hunk_header";
  content: string;
  oldNum?: number;
  newNum?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked" | "binary";
  hunks: DiffHunk[];
  truncated?: boolean;
}

function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileSections = text.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split("\n");
    // Extract file path from "a/path b/path"
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const path = headerMatch[2];
    let status: DiffFile["status"] = "modified";

    // Check for binary
    if (section.includes("Binary files")) {
      files.push({ path, status: "binary", hunks: [] });
      continue;
    }

    // Check for new/deleted file
    if (section.includes("new file mode")) status = "added";
    else if (section.includes("deleted file mode")) status = "deleted";
    else if (section.includes("rename from")) status = "renamed";

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldNum = 0;
    let newNum = 0;
    let lineCount = 0;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (m) {
          oldNum = parseInt(m[1]);
          newNum = parseInt(m[2]);
          currentHunk = { header: line, lines: [] };
          hunks.push(currentHunk);
        }
      } else if (currentHunk) {
        if (lineCount >= 2000) continue;
        if (line.startsWith("+")) {
          currentHunk.lines.push({ type: "addition", content: line.slice(1), newNum: newNum++ });
          lineCount++;
        } else if (line.startsWith("-")) {
          currentHunk.lines.push({ type: "deletion", content: line.slice(1), oldNum: oldNum++ });
          lineCount++;
        } else if (line.startsWith(" ") || line === "") {
          // Only push context if inside a hunk and line starts with space
          if (line.startsWith(" ")) {
            currentHunk.lines.push({ type: "context", content: line.slice(1), oldNum: oldNum++, newNum: newNum++ });
            lineCount++;
          }
        }
      }
    }

    files.push({ path, status, hunks, truncated: lineCount >= 2000 });
  }

  return files;
}

async function getGitDiff(cwd: string): Promise<{ files: DiffFile[]; stats: { files: number; additions: number; deletions: number } }> {
  let diffText = "";
  try {
    // Try diff against HEAD first
    const result = await Bun.$`git -C ${cwd} diff HEAD`.quiet();
    diffText = result.text();
  } catch {
    try {
      // No HEAD (empty repo) — try cached
      const result = await Bun.$`git -C ${cwd} diff --cached`.quiet();
      diffText = result.text();
    } catch {
      diffText = "";
    }
  }

  const files = parseUnifiedDiff(diffText);

  // Get untracked files
  try {
    const untrackedResult = await Bun.$`git -C ${cwd} ls-files --others --exclude-standard`.quiet();
    const untrackedPaths = untrackedResult.text().trim().split("\n").filter(Boolean);

    for (const filePath of untrackedPaths) {
      const fullPath = join(cwd, filePath);
      try {
        const s = await stat(fullPath);
        if (s.size > 50 * 1024) {
          files.push({ path: filePath, status: "untracked", hunks: [], truncated: true });
          continue;
        }
        const content = await readFile(fullPath, "utf-8");
        const contentLines = content.split("\n");
        const lines: DiffLine[] = [];
        const limit = Math.min(contentLines.length, 2000);
        for (let i = 0; i < limit; i++) {
          lines.push({ type: "addition", content: contentLines[i], newNum: i + 1 });
        }
        files.push({
          path: filePath,
          status: "untracked",
          hunks: lines.length ? [{ header: `@@ -0,0 +1,${limit} @@ new file`, lines }] : [],
          truncated: contentLines.length > 2000,
        });
      } catch {
        // Binary or unreadable
        files.push({ path: filePath, status: "untracked", hunks: [] });
      }
    }
  } catch {}

  // Compute stats
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "addition") additions++;
        else if (line.type === "deletion") deletions++;
      }
    }
  }

  return { files, stats: { files: files.length, additions, deletions } };
}

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

// --- Subscriber management ---

type ServerWebSocket<T> = import("bun").ServerWebSocket<T>;
interface WsData {
  sessionId?: string;
}

const subscribers = new Map<string, Set<ServerWebSocket<WsData>>>();

function getSubscribers(sessionId: string): Set<ServerWebSocket<WsData>> {
  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Set();
    subscribers.set(sessionId, set);
  }
  return set;
}

function broadcast(sessionId: string, msg: object) {
  const payload = JSON.stringify(msg);
  const subs = subscribers.get(sessionId);
  if (!subs) return;
  for (const ws of subs) {
    ws.send(payload);
  }
}

// --- Wire rotom session events → forward directly to subscribers ---

function wireSession(session: Session) {
  const events = [
    "response.created",
    "response.in_progress",
    "response.output_item.added",
    "response.output_item.done",
    "response.output_text.delta",
    "response.output_text.done",
    "response.completed",
    "response.failed",
  ] as const;

  for (const event of events) {
    session.on(event, (e: object) => {
      broadcast(session.id, e);
    });
  }
}

// --- Folder browsing ---

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
      } catch {}
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch {}
  return { path: dirPath, entries };
}

// --- Startup ---

const rotom = new Rotom({ dataDir: DATA_DIR });
await loadDefaults();
await rotom.load();

// Wire existing loaded sessions
for (const info of rotom.list()) {
  const session = rotom.get(info.id);
  if (session) wireSession(session);
}

console.log(`loaded ${rotom.list().length} saved session(s)`);

// --- Server ---

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
    open(_ws: ServerWebSocket<WsData>) {},
    message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());

        switch (msg.type) {
          case "list": {
            ws.send(
              JSON.stringify({
                type: "sessions",
                sessions: rotom.list(),
              }),
            );
            break;
          }

          case "create": {
            const cwd = msg.cwd || homedir();
            const cli: CLIType = msg.cli === "codex" ? "codex" : "claude";
            rotom.create({ cwd, cli }).then((session) => {
              wireSession(session);
              defaults = { cwd, cli };
              saveDefaults();
              ws.send(
                JSON.stringify({ type: "created", session: session.info() }),
              );
            });
            break;
          }

          case "open": {
            const session = rotom.get(msg.sessionId);
            if (!session) {
              ws.send(
                JSON.stringify({ type: "error", message: "session not found" }),
              );
              return;
            }
            ws.data.sessionId = msg.sessionId;
            getSubscribers(msg.sessionId).add(ws);
            isGitRepo(session.cwd).then((isGit) => {
              ws.send(
                JSON.stringify({
                  type: "history",
                  messages: session.messages,
                  cwd: session.cwd,
                  cli: session.cli,
                  title: session.title,
                  isGit,
                }),
              );
            });
            break;
          }

          case "message": {
            const session = rotom.get(msg.sessionId);
            if (!session) {
              ws.send(
                JSON.stringify({ type: "error", message: "session not found" }),
              );
              return;
            }
            session.send(msg.text);
            break;
          }

          case "delete": {
            const session = rotom.get(msg.sessionId);
            if (session) {
              const subs = subscribers.get(msg.sessionId);
              if (subs) {
                for (const sub of subs) {
                  sub.send(JSON.stringify({ type: "closed" }));
                }
                subscribers.delete(msg.sessionId);
              }
              rotom.destroy(msg.sessionId);
            }
            ws.send(
              JSON.stringify({ type: "deleted", sessionId: msg.sessionId }),
            );
            break;
          }

          case "leave": {
            const subs = subscribers.get(msg.sessionId);
            if (subs) {
              subs.delete(ws);
              ws.data.sessionId = undefined;
              if (subs.size === 0) {
                subscribers.delete(msg.sessionId);
              }
            }
            break;
          }

          case "git_diff": {
            const session = rotom.get(msg.sessionId);
            if (!session) {
              ws.send(
                JSON.stringify({ type: "error", message: "session not found" }),
              );
              return;
            }
            getGitDiff(session.cwd).then((result) => {
              ws.send(
                JSON.stringify({
                  type: "git_diff_result",
                  stats: result.stats,
                  files: result.files,
                }),
              );
            });
            break;
          }

          case "browse": {
            const dir = msg.path || defaults.cwd;
            browsePath(dir).then((result) => {
              ws.send(
                JSON.stringify({ type: "browse_result", ...result, defaults }),
              );
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
        const subs = subscribers.get(ws.data.sessionId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            subscribers.delete(ws.data.sessionId);
          }
        }
      }
    },
  },
});

console.log(`meloetta running at http://${HOST}:${PORT}`);
