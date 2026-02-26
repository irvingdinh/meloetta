import { useEffect, useState } from "react";

import { listSessions } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";
import { ago, pathLeaf } from "@/lib/utils";

const PAGE_SIZE = 25;

interface Props {
  onOpenSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionListPage({ onOpenSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  const visible = sessions.slice(0, visibleCount);
  const hasMore = visibleCount < sessions.length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-sm text-text-dim">meloetta</h1>
        <button
          onClick={onNewSession}
          className="cursor-pointer border border-border-strong bg-bg-muted px-2.5 py-1 font-mono text-xs text-text hover:bg-bg-elevated hover:text-text-bright"
        >
          + new
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {sessions.length === 0 ? (
          <div className="p-10 text-center text-text-ghost">no sessions</div>
        ) : (
          <>
            {visible.map((s) => (
              <div
                key={s.id}
                onClick={() => onOpenSession(s.id)}
                className="cursor-pointer border-b border-bg-subtle px-4 py-2.5 hover:bg-bg-subtle"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-muted">
                    {s.title}
                  </span>
                  <span className="shrink-0 border border-border-muted px-1.5 py-px text-[11px] text-text-faint">
                    {s.cli}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-faint">
                    {ago(s.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-text-faint">
                  <span className="shrink-0">{pathLeaf(s.cwd)}</span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-ghost">
                    {s.cwd}
                  </span>
                </div>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full cursor-pointer py-3 text-center text-xs text-text-faint hover:bg-bg-subtle hover:text-text-muted"
              >
                load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
