import { EventEmitter } from "node:events";
import type {
  CLIType,
  Message,
  RotomEvent,
  SessionInfo,
} from "../types.js";

export interface MockSessionOptions {
  id?: string;
  cwd?: string;
  cli?: CLIType;
  events: RotomEvent[];
  delay?: number; // ms between events, default 0 (async via queueMicrotask)
}

export interface MockSession extends EventEmitter {
  readonly id: string;
  readonly cwd: string;
  readonly cli: CLIType;
  readonly messages: readonly Message[];
  readonly alive: boolean;
  send(text: string): void;
  kill(): void;
  info(): SessionInfo;
}

export function createMockSession(
  optionsOrEvents: MockSessionOptions | RotomEvent[],
): MockSession {
  const opts: MockSessionOptions = Array.isArray(optionsOrEvents)
    ? { events: optionsOrEvents }
    : optionsOrEvents;

  const emitter = new EventEmitter();
  const messages: Message[] = [];
  let buffer = "";
  let textItemEmitted = false;
  let isAlive = false;

  function processEvent(event: RotomEvent): void {
    switch (event.type) {
      case "response.in_progress":
        buffer = "";
        textItemEmitted = false;
        emitter.emit(event.type, event);
        break;

      case "response.output_text.delta":
        if (!textItemEmitted) {
          textItemEmitted = true;
          emitter.emit("response.output_item.added", {
            type: "response.output_item.added" as const,
            item: { type: "message" as const, role: "assistant" as const },
          });
        }
        buffer += event.delta;
        emitter.emit(event.type, event);
        break;

      case "response.completed":
        if (buffer) {
          emitter.emit("response.output_text.done", {
            type: "response.output_text.done" as const,
            text: buffer,
          });
          emitter.emit("response.output_item.done", {
            type: "response.output_item.done" as const,
            item: { type: "message" as const, role: "assistant" as const },
          });
          messages.push({ role: "assistant", text: buffer });
          buffer = "";
        }
        textItemEmitted = false;
        isAlive = false;
        emitter.emit(event.type, event);
        break;

      case "response.failed":
        isAlive = false;
        emitter.emit(event.type, event);
        break;

      default:
        emitter.emit(event.type, event);
        break;
    }
  }

  const base = Object.assign(emitter, {
    id: opts.id ?? "mock",
    cwd: opts.cwd ?? "/tmp",
    cli: (opts.cli ?? "claude") as CLIType,

    send(text: string): void {
      messages.push({ role: "user", text });
      isAlive = true;

      const events = [...opts.events];
      const delay = opts.delay ?? 0;
      let i = 0;

      function next(): void {
        if (i >= events.length) return;
        const event = events[i++]!;
        processEvent(event);

        if (i < events.length) {
          if (delay > 0) {
            setTimeout(next, delay);
          } else {
            queueMicrotask(next);
          }
        }
      }

      if (delay > 0) {
        setTimeout(next, delay);
      } else {
        queueMicrotask(next);
      }
    },

    kill(): void {
      isAlive = false;
    },

    info(): SessionInfo {
      return {
        id: base.id,
        title: messages.find((m) => m.role === "user")?.text.slice(0, 80) || "Mock session",
        createdAt: Date.now(),
        cwd: base.cwd,
        cli: base.cli,
        messageCount: messages.length,
        alive: isAlive,
      };
    },
  });

  Object.defineProperty(base, "messages", {
    get: () => messages as readonly Message[],
    enumerable: true,
  });

  Object.defineProperty(base, "alive", {
    get: () => isAlive,
    enumerable: true,
  });

  return base as MockSession;
}
