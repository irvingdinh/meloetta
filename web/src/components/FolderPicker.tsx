import { useCallback, useEffect, useState } from "react";

import { browse } from "@/lib/api";
import type { BrowseEntry, CLIType } from "@/lib/types";

interface Props {
  onClose: () => void;
  onSelect: (cwd: string, cli: CLIType) => void;
  initialCli?: CLIType;
}

export function FolderPicker({
  onClose,
  onSelect,
  initialCli = "claude",
}: Props) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [cli, setCli] = useState<CLIType>(initialCli);

  useEffect(() => {
    let cancelled = false;
    browse()
      .then((result) => {
        if (cancelled) return;
        setPath(result.path);
        setEntries(result.entries);
        setCli(result.config.cli);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const navigateTo = useCallback((dirPath: string) => {
    browse(dirPath)
      .then((result) => {
        setPath(result.path);
        setEntries(result.entries);
      })
      .catch(() => {});
  }, []);

  const navigateUp = () => {
    const parent = path.replace(/\/[^/]+\/?$/, "") || "/";
    navigateTo(parent);
  };

  const navigateInto = (name: string) => {
    const sub = path === "/" ? `/${name}` : `${path}/${name}`;
    navigateTo(sub);
  };

  const isRoot = path === "/";

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-[500px] max-w-[calc(100vw-32px)] flex-col border border-border-strong bg-bg-subtle">
        <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
          <span className="text-text-muted">select folder</span>
          <button
            onClick={onClose}
            className="cursor-pointer border border-border-strong bg-bg-muted px-3.5 py-1.5 font-mono text-sm text-text hover:bg-bg-elevated hover:text-text-bright"
          >
            cancel
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {!isRoot && (
            <button
              onClick={navigateUp}
              className="cursor-pointer border border-border-strong bg-bg-muted px-3.5 py-1.5 font-mono text-sm text-text hover:bg-bg-elevated hover:text-text-bright"
            >
              ..
            </button>
          )}
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-text-muted [direction:rtl] [text-align:left]">
            {path}
          </span>
        </div>

        <div className="max-h-[400px] flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="p-10 text-center text-text-ghost">empty</div>
          ) : (
            entries.map((e) => (
              <div
                key={e.name}
                onClick={() => navigateInto(e.name)}
                className="flex min-h-11 cursor-pointer items-center px-4 py-2 text-text-muted before:mr-1 before:text-text-ghost before:content-['/\00a0'] hover:bg-bg-muted hover:text-text"
              >
                {e.name}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border-muted px-4 py-3 max-sm:flex-col max-sm:gap-2.5">
          <div className="flex">
            <button
              onClick={() => setCli("claude")}
              className={`cursor-pointer rounded-l border border-r-0 border-border-strong px-3.5 py-1.5 font-mono text-sm ${
                cli === "claude"
                  ? "bg-border-strong text-text-bright"
                  : "bg-bg-muted text-text hover:bg-bg-elevated hover:text-text-bright"
              }`}
            >
              claude
            </button>
            <button
              onClick={() => setCli("codex")}
              className={`cursor-pointer rounded-r border border-border-strong px-3.5 py-1.5 font-mono text-sm ${
                cli === "codex"
                  ? "bg-border-strong text-text-bright"
                  : "bg-bg-muted text-text hover:bg-bg-elevated hover:text-text-bright"
              }`}
            >
              codex
            </button>
          </div>
          <button
            onClick={() => onSelect(path, cli)}
            className="cursor-pointer border border-border-strong bg-bg-muted px-3.5 py-1.5 font-mono text-sm text-text hover:bg-bg-elevated hover:text-text-bright max-sm:w-full"
          >
            start session
          </button>
        </div>
      </div>
    </div>
  );
}
