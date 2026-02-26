import { useEffect, useRef } from "react";

import type { RotomEvent } from "@/lib/types";

const EVENT_TYPES = [
  "response.created",
  "response.in_progress",
  "response.output_item.added",
  "response.output_item.done",
  "response.output_text.delta",
  "response.output_text.done",
  "response.completed",
  "response.failed",
] as const;

export function useSessionEvents(
  sessionId: string | null,
  onEvent: (event: RotomEvent) => void,
): void {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!sessionId) return;

    const es = new EventSource(`/api/sessions/${sessionId}/events`);

    const handler = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as RotomEvent;
        onEventRef.current(event);
      } catch {
        // ignore malformed events
      }
    };

    for (const type of EVENT_TYPES) {
      es.addEventListener(type, handler);
    }

    return () => {
      es.close();
    };
  }, [sessionId]);
}
