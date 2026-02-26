import { useEffect, useState } from "react";

import { getDiff } from "@/lib/api";
import type { DiffFile, DiffResult } from "@/lib/types";

interface Props {
  sessionId: string;
  onClose: () => void;
}

function FileSection({ file }: { file: DiffFile }) {
  const statusLabel: Record<DiffFile["status"], string> = {
    modified: "M",
    added: "A",
    deleted: "D",
    renamed: "R",
    untracked: "?",
    binary: "B",
  };

  const statusColor: Record<DiffFile["status"], string> = {
    modified: "text-text-muted",
    added: "text-addition",
    deleted: "text-deletion",
    renamed: "text-text-muted",
    untracked: "text-text-dim",
    binary: "text-text-dim",
  };

  return (
    <div className="border-b border-border-muted">
      <div className="flex items-center gap-2 bg-bg-muted px-4 py-2">
        <span className={`text-xs font-medium ${statusColor[file.status]}`}>
          {statusLabel[file.status]}
        </span>
        <span className="text-sm text-text-muted">{file.path}</span>
        {file.truncated && (
          <span className="text-[10px] text-text-faint">(truncated)</span>
        )}
      </div>

      {file.hunks.map((hunk, hi) => (
        <div key={hi}>
          <div className="bg-bg-subtle px-4 py-1 text-xs text-text-faint">
            {hunk.header}
          </div>
          <div className="font-mono text-xs">
            {hunk.lines.map((line, li) => {
              let bg = "";
              let textColor = "text-text";
              let prefix = " ";

              if (line.type === "addition") {
                bg = "bg-addition/10";
                textColor = "text-addition";
                prefix = "+";
              } else if (line.type === "deletion") {
                bg = "bg-deletion/10";
                textColor = "text-deletion";
                prefix = "-";
              } else {
                textColor = "text-text-dim";
              }

              return (
                <div key={li} className={`flex whitespace-pre-wrap ${bg}`}>
                  <span className="w-10 shrink-0 select-none pr-2 text-right text-text-ghost">
                    {line.oldNum ?? ""}
                  </span>
                  <span className="w-10 shrink-0 select-none pr-2 text-right text-text-ghost">
                    {line.newNum ?? ""}
                  </span>
                  <span className={`w-4 shrink-0 select-none ${textColor}`}>
                    {prefix}
                  </span>
                  <span className={`flex-1 ${textColor}`}>{line.content}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiffOverlay({ sessionId, onClose }: Props) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDiff(sessionId)
      .then(setDiff)
      .catch(() => setDiff(null))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-[800px] max-w-[calc(100vw-32px)] flex-col border border-border-strong bg-bg">
        <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-text-muted">git diff</span>
            {diff && (
              <span className="text-xs text-text-faint">
                {diff.stats.files} file{diff.stats.files !== 1 ? "s" : ""},{" "}
                <span className="text-addition">+{diff.stats.additions}</span>{" "}
                <span className="text-deletion">-{diff.stats.deletions}</span>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer border border-border-strong bg-bg-muted px-3.5 py-1.5 font-mono text-sm text-text hover:bg-bg-elevated hover:text-text-bright"
          >
            close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-text-ghost">loading...</div>
          ) : !diff || diff.files.length === 0 ? (
            <div className="p-10 text-center text-text-ghost">no changes</div>
          ) : (
            diff.files.map((file, i) => <FileSection key={i} file={file} />)
          )}
        </div>
      </div>
    </div>
  );
}
