import type { Session } from "../session.js";
import type { RotomEvent } from "../types.js";

const encoder = new TextEncoder();

const SESSION_EVENTS = [
  "response.created",
  "response.in_progress",
  "response.output_item.added",
  "response.output_item.done",
  "response.output_text.delta",
  "response.output_text.done",
  "response.completed",
  "response.failed",
] as const;

export class SSEManager {
  private _connections = new Map<
    string,
    Set<ReadableStreamDefaultController>
  >();
  private _wired = new Set<string>();

  wireSession(session: Session): void {
    if (this._wired.has(session.id)) return;
    this._wired.add(session.id);

    for (const eventType of SESSION_EVENTS) {
      session.on(eventType, (e: object) => {
        this.broadcast(session.id, e as RotomEvent);
      });
    }
  }

  connect(sessionId: string): Response {
    const controllers = this._getControllers(sessionId);
    let ctrl: ReadableStreamDefaultController;

    const stream = new ReadableStream({
      start(controller) {
        ctrl = controller;
        controllers.add(controller);
      },
      cancel: () => {
        controllers.delete(ctrl);
        if (controllers.size === 0) {
          this._connections.delete(sessionId);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  broadcast(sessionId: string, event: RotomEvent): void {
    const controllers = this._connections.get(sessionId);
    if (!controllers) return;

    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const encoded = encoder.encode(payload);

    for (const controller of controllers) {
      try {
        controller.enqueue(encoded);
      } catch {
        controllers.delete(controller);
      }
    }
  }

  closeSession(sessionId: string): void {
    const controllers = this._connections.get(sessionId);
    if (!controllers) return;
    for (const controller of controllers) {
      try {
        controller.close();
      } catch {
        // already closed
      }
    }
    this._connections.delete(sessionId);
  }

  closeAll(): void {
    for (const sessionId of this._connections.keys()) {
      this.closeSession(sessionId);
    }
  }

  private _getControllers(
    sessionId: string,
  ): Set<ReadableStreamDefaultController> {
    let set = this._connections.get(sessionId);
    if (!set) {
      set = new Set();
      this._connections.set(sessionId, set);
    }
    return set;
  }
}
