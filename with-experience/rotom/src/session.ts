import { EventEmitter } from "node:events";
import { createClaudeAdapter } from "./adapters/claude.js";
import { createCodexAdapter } from "./adapters/codex.js";
import { saveMeta } from "./persistence.js";
import type {
  AdapterConfig,
  CLIType,
  ClaudeAdapterOptions,
  CodexAdapterOptions,
  InternalAdapter,
  Message,
  RotomEvent,
  SessionInfo,
  SessionMeta,
} from "./types.js";

export interface SessionOptions {
  meta: SessionMeta;
  dataDir: string;
  adapterOptions?: ClaudeAdapterOptions | CodexAdapterOptions;
}

export class Session extends EventEmitter {
  readonly id: string;
  readonly cwd: string;
  readonly cli: CLIType;
  readonly createdAt: number;

  private _title: string;
  private _messages: Message[];
  private _cliSessionId: string | null;
  private _dataDir: string;
  private _adapterOptions?: ClaudeAdapterOptions | CodexAdapterOptions;
  private _adapter: InternalAdapter | null = null;
  private _buffer = "";
  private _textItemEmitted = false;
  private _lastActivity: number;

  constructor(options: SessionOptions) {
    super();
    this.id = options.meta.id;
    this.cwd = options.meta.cwd;
    this.cli = options.meta.cli;
    this.createdAt = options.meta.createdAt;
    this._title = options.meta.title;
    this._messages = [...options.meta.messages];
    this._cliSessionId = options.meta.cliSessionId;
    this._dataDir = options.dataDir;
    this._adapterOptions = options.adapterOptions;
    this._lastActivity = Date.now();
  }

  get title(): string {
    return this._title;
  }

  get messages(): readonly Message[] {
    return this._messages;
  }

  get alive(): boolean {
    return this._adapter !== null;
  }

  get lastActivity(): number {
    return this._lastActivity;
  }

  send(text: string): void {
    this._lastActivity = Date.now();
    this._messages.push({ role: "user", text });
    this._save();

    if (!this._adapter) {
      this._spawnAdapter();
    }

    this._adapter!.send(text);
  }

  kill(): void {
    if (this._adapter) {
      this._adapter.kill();
      this._adapter = null;
    }
  }

  info(): SessionInfo {
    return {
      id: this.id,
      title: this._title || "New session",
      createdAt: this.createdAt,
      cwd: this.cwd,
      cli: this.cli,
      messageCount: this._messages.length,
      alive: this.alive,
    };
  }

  /** @internal */
  toMeta(): SessionMeta {
    return {
      id: this.id,
      title: this._title,
      createdAt: this.createdAt,
      cwd: this.cwd,
      cli: this.cli,
      cliSessionId: this._cliSessionId,
      messages: [...this._messages],
    };
  }

  private _spawnAdapter(): void {
    const config: AdapterConfig = {
      cwd: this.cwd,
      cliSessionId: this._cliSessionId,
      adapterOptions: this._adapterOptions,
    };

    const emit = (event: RotomEvent) => this._handleEvent(event);

    const onInit = (data: { cliSessionId?: string }) => {
      if (data.cliSessionId) {
        this._cliSessionId = data.cliSessionId;
        this._save();
      }
    };

    if (this.cli === "codex") {
      this._adapter = createCodexAdapter(config, emit, onInit);
    } else {
      this._adapter = createClaudeAdapter(config, emit, onInit);
    }
  }

  private _handleEvent(event: RotomEvent): void {
    switch (event.type) {
      case "response.in_progress":
        this._buffer = "";
        this._textItemEmitted = false;
        this.emit(event.type, event);
        break;

      case "response.output_text.delta":
        if (!this._textItemEmitted) {
          this._textItemEmitted = true;
          this.emit("response.output_item.added", {
            type: "response.output_item.added" as const,
            item: { type: "message" as const, role: "assistant" as const },
          });
        }
        this._buffer += event.delta;
        this.emit(event.type, event);
        break;

      case "response.completed":
        if (this._buffer) {
          this.emit("response.output_text.done", {
            type: "response.output_text.done" as const,
            text: this._buffer,
          });
          this.emit("response.output_item.done", {
            type: "response.output_item.done" as const,
            item: { type: "message" as const, role: "assistant" as const },
          });
          this._messages.push({ role: "assistant", text: this._buffer });
          this._autoTitle();
          this._buffer = "";
        }
        this._textItemEmitted = false;
        this.emit(event.type, event);
        this._save();
        break;

      case "response.failed":
        this._adapter = null;
        this.emit(event.type, event);
        break;

      default:
        this.emit(event.type, event);
        break;
    }
  }

  private _autoTitle(): void {
    if (!this._title) {
      const firstUser = this._messages.find((m) => m.role === "user");
      this._title = firstUser?.text.slice(0, 80) || "Untitled";
    }
  }

  private _save(): void {
    saveMeta(this._dataDir, this.toMeta()).catch(() => {
      // persistence errors are non-fatal
    });
  }
}
