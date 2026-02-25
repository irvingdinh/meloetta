import { deleteMeta, loadAllMeta, saveMeta } from "./persistence.js";
import { Session } from "./session.js";
import type {
  CLIType,
  CreateSessionOptions,
  RotomOptions,
  SessionInfo,
} from "./types.js";

export class Rotom {
  private _dataDir: string;
  private _sessions = new Map<string, Session>();

  constructor(options: RotomOptions) {
    this._dataDir = options.dataDir;
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
    for (const session of this._sessions.values()) {
      session.kill();
    }
  }
}
