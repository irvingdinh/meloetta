import { useEffect, useState } from "react";

import { listSessions } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";
import { ago } from "@/lib/utils";

interface Props {
  onOpenSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionListPage({ onOpenSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((list) => {
        if (cancelled) return;
        list.sort((a, b) => b.createdAt - a.createdAt);
        setSessions(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h1 className="text-sm text-text-dim">meloetta</h1>
        <button
          onClick={onNewSession}
          className="min-h-11 cursor-pointer border border-border-strong bg-bg-muted px-3.5 py-1.5 font-mono text-sm text-text hover:bg-bg-elevated hover:text-text-bright"
        >
          + new
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-10 text-center text-text-ghost">no sessions</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onOpenSession(s.id)}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-bg-subtle px-4 py-3 hover:bg-bg-subtle max-sm:flex-col max-sm:items-start max-sm:gap-1.5"
            >
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-text-muted">
                {s.title}
              </span>
              <div className="flex flex-shrink-0 items-center gap-3 max-sm:w-full max-sm:flex-wrap">
                <span className="border border-border-muted px-1.5 py-px text-[11px] text-text-faint">
                  {s.cli}
                </span>
                <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-text-faint max-sm:max-w-full">
                  {s.cwd}
                </span>
                <span className="text-xs text-text-faint">
                  {ago(s.createdAt)}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${s.alive ? "bg-alive" : "bg-text-faint"}`}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
