import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { MessageBubble } from "@/components/MessageBubble";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { getSession, sendMessage } from "@/lib/api";
import type { Message, RotomEvent } from "@/lib/types";
import { pathLeaf } from "@/lib/utils";

interface Props {
  sessionId: string;
  onBack: () => void;
  onShowDiff: () => void;
}

export function SessionPage({ sessionId, onBack, onShowDiff }: Props) {
  const [cwd, setCwd] = useState("");
  const [cli, setCli] = useState("");
  const [isGit, setIsGit] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [activity, setActivity] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [showMore, setShowMore] = useState(false);

  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getSession(sessionId)
      .then((data) => {
        if (cancelled) return;
        setCwd(data.cwd);
        setCli(data.cli);
        setIsGit(data.isGit);
        setMessages(data.messages);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!showMore) return;
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [showMore]);

  const handleEvent = useCallback((event: RotomEvent) => {
    switch (event.type) {
      case "response.in_progress":
        setStreaming(true);
        setStreamBuffer("");
        setActivity("thinking...");
        break;

      case "response.output_item.added":
        if (event.item.type === "function_call") {
          setActivity(`calling ${event.item.name}...`);
        } else if (event.item.type === "reasoning") {
          setActivity("reasoning...");
        }
        break;

      case "response.output_text.delta":
        setActivity("");
        setStreamBuffer((prev) => prev + event.delta);
        break;

      case "response.output_text.done":
        setStreamBuffer("");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: event.text },
        ]);
        break;

      case "response.completed":
        setStreaming(false);
        setActivity("");
        setStreamBuffer("");
        break;

      case "response.failed":
        setStreaming(false);
        setActivity(`error: ${event.error}`);
        setStreamBuffer("");
        break;
    }
  }, []);

  useSessionEvents(sessionId, handleEvent);

  useLayoutEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [messages, streamBuffer, activity]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || streaming) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInputValue("");
    setStreaming(true);
    setActivity("thinking...");

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      await sendMessage(sessionId, text);
    } catch {
      setActivity("failed to send message");
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <button
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-text-faint hover:text-text-bright"
        >
          &larr;
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-text-faint">
          <span className="shrink-0">{pathLeaf(cwd)}</span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-ghost">
            {cwd}
          </span>
        </div>
        <div ref={moreRef} className="relative shrink-0">
          <button
            onClick={() => setShowMore((v) => !v)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center text-text-faint hover:text-text-bright"
          >
            &#8942;
          </button>
          {showMore && (
            <div className="absolute right-0 top-full z-10 mt-1 flex flex-col gap-1 border border-border-strong bg-bg-muted p-2">
              <span className="whitespace-nowrap border border-border-muted px-1.5 py-px text-[11px] text-text-faint">
                {cli}
              </span>
              {isGit && (
                <button
                  onClick={() => {
                    setShowMore(false);
                    onShowDiff();
                  }}
                  className="cursor-pointer whitespace-nowrap border border-border-strong bg-bg-subtle px-2 py-1 text-left font-mono text-xs text-text-muted hover:bg-bg-elevated hover:text-text-bright"
                >
                  diff
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={msgsRef} className="flex-1 overflow-y-auto p-4 max-sm:p-3">
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {activity && (
          <div className="mb-1 pl-4 text-xs text-text-faint before:text-text-ghost before:content-['~_'] max-sm:pl-2">
            {activity}
          </div>
        )}

        {streamBuffer && (
          <MessageBubble
            message={{ role: "assistant", text: streamBuffer }}
            streaming
          />
        )}
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-3 max-sm:px-3 max-sm:py-2">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          rows={1}
          placeholder="message..."
          className="max-h-[200px] min-h-10 flex-1 resize-none border border-border-muted bg-bg-subtle p-2 font-mono text-sm text-text placeholder:text-text-ghost focus:border-text-faint focus:outline-none disabled:opacity-40 max-sm:text-base"
        />
        <button
          onClick={handleSend}
          disabled={streaming}
          className="min-h-11 cursor-pointer border border-border-strong bg-bg-muted px-3.5 py-1.5 font-mono text-sm text-text hover:bg-bg-elevated hover:text-text-bright disabled:cursor-not-allowed disabled:opacity-40"
        >
          send
        </button>
      </div>
    </div>
  );
}
