import type { Message } from "@/lib/types";

interface Props {
  message: Message;
  streaming?: boolean;
}

export function MessageBubble({ message, streaming }: Props) {
  if (message.role === "user") {
    return (
      <div className="mb-4 whitespace-pre-wrap break-words text-text-bright before:text-text-faint before:content-['>_']">
        {message.text}
      </div>
    );
  }

  return (
    <div
      className={`mb-4 whitespace-pre-wrap break-words pl-4 text-assistant max-sm:pl-2 ${
        streaming ? "opacity-80" : ""
      }`}
    >
      {message.text}
    </div>
  );
}
