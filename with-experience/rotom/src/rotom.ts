import { deleteMeta, loadAllMeta, saveMeta } from "./persistence.js";
import { Session } from "./session.js";
import type {
  CLIType,
  CreateSessionOptions,
  RotomOptions,
  SessionInfo,
} from "./types.js";

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export class Rotom {
  private _dataDir: string;
  private _idleTimeout: number;
  private _sessions = new Map<string, Session>();
  private _idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RotomOptions) {
    this._dataDir = options.dataDir;
    this._idleTimeout = options.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
  }

  async load(): Promise<void> {
    const metas = await loadAllMeta(this._dataDir);
    for (const meta of metas) {
      if (this._sessions.has(meta.id)) continue;
      const session = new Session({
        meta: {
          ...meta,
          cli: meta.cli || "claude",
        },
        dataDir: this._dataDir,
      });
      this._sessions.set(meta.id, session);
    }
    this._startIdleCleanup();
  }

  async create(options: CreateSessionOptions): Promise<Session> {
    const id = crypto.randomUUID().slice(0, 8);
    const cli: CLIType = options.cli === "codex" ? "codex" : "claude";

    const session = new Session({
      meta: {
        id,
        title: "",
        createdAt: Date.now(),
        cwd: options.cwd,
        cli,
        cliSessionId: null,
        messages: [],
      },
      dataDir: this._dataDir,
      adapterOptions: options.adapter,
    });

    this._sessions.set(id, session);
    await saveMeta(this._dataDir, session.toMeta());
    this._startIdleCleanup();
    return session;
  }

  get(id: string): Session | undefined {
    return this._sessions.get(id);
  }

  list(): SessionInfo[] {
    return [...this._sessions.values()].map((s) => s.info());
  }

  async destroy(id: string): Promise<void> {
    const session = this._sessions.get(id);
    if (!session) return;
    session.kill();
    this._sessions.delete(id);
    await deleteMeta(this._dataDir, id);
  }

  close(): void {
    if (this._idleTimer) {
      clearInterval(this._idleTimer);
      this._idleTimer = null;
    }
    for (const session of this._sessions.values()) {
      session.kill();
    }
  }

  private _startIdleCleanup(): void {
    if (this._idleTimer) return;
    if (this._idleTimeout <= 0) return;

    this._idleTimer = setInterval(() => {
      const now = Date.now();
      for (const session of this._sessions.values()) {
        if (!session.alive) continue;
        if (now - session.lastActivity > this._idleTimeout) {
          session.kill();
          session.emit("response.failed", {
            type: "response.failed" as const,
            error: "idle timeout",
          });
        }
      }
    }, 60_000);

    // Don't keep the process alive just for idle cleanup
    if (this._idleTimer && typeof this._idleTimer === "object" && "unref" in this._idleTimer) {
      this._idleTimer.unref();
    }
  }
}
