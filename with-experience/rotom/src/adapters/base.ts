import type { ChildProcess } from "node:child_process";

export function readLines(
  proc: ChildProcess,
  onLine: (line: string) => void,
  onEnd?: () => void,
): void {
  let partial = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    partial += chunk.toString();
    const lines = partial.split("\n");
    partial = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onLine(line);
    }
  });

  proc.stdout?.on("end", () => {
    onEnd?.();
  });
}

let callIdCounter = 0;

export function generateCallId(): string {
  return `call_${Date.now()}_${++callIdCounter}`;
}
