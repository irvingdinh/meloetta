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

interface Props {
  sessionId: string;
  onBack: () => void;
  onShowDiff: () => void;
}

export function SessionPage({ sessionId, onBack, onShowDiff }: Props) {
  const [title, setTitle] = useState("loading...");
  const [cwd, setCwd] = useState("");
  const [cli, setCli] = useState("");
  const [isGit, setIsGit] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [activity, setActivity] = useState("");
  const [inputValue, setInputValue] = useState("");

  const msgsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    getSession(sessionId)
      .then((data) => {
        if (cancelled) return;
        setTitle(data.title || sessionId);
        setCwd(data.cwd);
        setCli(data.cli);
        setIsGit(data.isGit);
        setMessages(data.messages);
      })
      .catch(() => {
        if (!cancelled) setTitle("error loading session");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span
          onClick={onBack}
          className="cursor-pointer text-text-faint hover:text-text-bright max-sm:flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center"
        >
          &larr; back
        </span>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-text-dim">
          {title}
        </span>
        <span className="border border-border-muted px-1.5 py-px text-[11px] text-text-faint">
          {cli}
        </span>
        {isGit && (
          <button
            onClick={onShowDiff}
            className="cursor-pointer border border-border-strong bg-bg-muted px-2 py-1 font-mono text-xs text-text-muted hover:bg-bg-elevated hover:text-text-bright"
          >
            diff
          </button>
        )}
        <span className="w-full text-[11px] text-text-ghost max-sm:order-10 sm:hidden">
          {cwd}
        </span>
        <span className="text-[11px] text-text-ghost max-sm:hidden">{cwd}</span>
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

      <div className="px-4 py-1 text-[11px] text-text-ghost">
        {streaming ? "streaming..." : ""}
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
