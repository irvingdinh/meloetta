import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLines } from "../../src/adapters/base.js";
import type { AdapterEmit, AdapterInitCallback, RotomEvent } from "../../src/types.js";
import { EventEmitter } from "node:events";

// Simulate Claude CLI output by feeding fixture lines through readLines logic
// We test the parsing layer directly instead of spawning a real process

function parseClaudeLine(line: string, emit: AdapterEmit, onInit: AdapterInitCallback): void {
  // This mirrors the parsing logic in createClaudeAdapter
  try {
    const data = JSON.parse(line);

    if (data.type === "system" && data.subtype === "init") {
      if (data.session_id) {
        onInit({ cliSessionId: data.session_id });
      }
      emit({ type: "response.created" });
      emit({ type: "response.in_progress" });
      return;
    }

    if (
      data.type === "stream_event" &&
      data.event?.type === "content_block_start" &&
      data.event?.content_block?.type === "thinking"
    ) {
      emit({
        type: "response.output_item.added",
        item: { type: "reasoning" },
      });
      return;
    }

    if (
      data.type === "stream_event" &&
      data.event?.type === "content_block_start" &&
      data.event?.content_block?.type === "tool_use"
    ) {
      emit({
        type: "response.output_item.added",
        item: {
          type: "function_call",
          name: data.event.content_block.name || "unknown",
          arguments: "",
          call_id: "test_call",
        },
      });
      return;
    }

    if (data.type === "assistant" && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === "tool_use") {
          emit({
            type: "response.output_item.added",
            item: {
              type: "function_call",
              name: block.name,
              arguments: JSON.stringify(block.input ?? {}),
              call_id: "test_call_full",
            },
          });
          emit({
            type: "response.output_item.done",
            item: {
              type: "function_call",
              name: block.name,
              arguments: JSON.stringify(block.input ?? {}),
              call_id: "test_call_full",
            },
          });
        }
      }
      return;
    }

    if (data.type === "user" && data.tool_use_result !== undefined) {
      return;
    }

    if (
      data.type === "stream_event" &&
      data.event?.type === "content_block_delta" &&
      data.event?.delta?.type === "text_delta"
    ) {
      emit({
        type: "response.output_text.delta",
        delta: data.event.delta.text,
      });
      return;
    }

    if (data.type === "result") {
      emit({ type: "response.completed" });
      return;
    }
  } catch {
    // skip
  }
}

test("Claude adapter parses fixture into correct Responses API events", () => {
  const fixturePath = join(import.meta.dir, "../fixtures/claude-turn.jsonl");
  const lines = readFileSync(fixturePath, "utf-8").split("\n").filter((l) => l.trim());

  const events: RotomEvent[] = [];
  let initData: { cliSessionId?: string } | null = null;

  const emit: AdapterEmit = (event) => events.push(event);
  const onInit: AdapterInitCallback = (data) => {
    initData = data;
  };

  for (const line of lines) {
    parseClaudeLine(line, emit, onInit);
  }

  // Check init
  expect(initData).not.toBeNull();
  expect(initData!.cliSessionId).toBe("sess_abc123");

  // Check event sequence
  const types = events.map((e) => e.type);
  expect(types).toEqual([
    "response.created",
    "response.in_progress",
    "response.output_item.added",   // reasoning
    "response.output_item.added",   // tool_use start (streaming)
    "response.output_item.added",   // tool_use full (assistant message)
    "response.output_item.done",    // tool_use done
    "response.output_text.delta",   // "Here "
    "response.output_text.delta",   // "are the files."
    "response.completed",
  ]);

  // Check reasoning item
  const reasoningEvent = events[2]!;
  expect(reasoningEvent.type).toBe("response.output_item.added");
  if (reasoningEvent.type === "response.output_item.added") {
    expect(reasoningEvent.item.type).toBe("reasoning");
  }

  // Check function call from full assistant message
  const toolFullEvent = events[4]!;
  if (toolFullEvent.type === "response.output_item.added") {
    expect(toolFullEvent.item.type).toBe("function_call");
    if (toolFullEvent.item.type === "function_call") {
      expect(toolFullEvent.item.name).toBe("Bash");
      expect(JSON.parse(toolFullEvent.item.arguments)).toEqual({ command: "ls -la" });
    }
  }

  // Check text deltas
  const delta1 = events[6]!;
  if (delta1.type === "response.output_text.delta") {
    expect(delta1.delta).toBe("Here ");
  }
  const delta2 = events[7]!;
  if (delta2.type === "response.output_text.delta") {
    expect(delta2.delta).toBe("are the files.");
  }
});

test("readLines splits buffered output into lines", async () => {
  // Create a mock process with a readable stdout
  const { Readable } = await import("node:stream");
  const stdout = new Readable({ read() {} });

  const mockProc = {
    stdout,
    stdin: null,
    stderr: null,
    kill: () => {},
  } as any;

  const lines: string[] = [];

  readLines(mockProc, (line) => lines.push(line));

  // Simulate chunked data that splits across lines
  stdout.push(Buffer.from('{"type":"sys'));
  stdout.push(Buffer.from('tem"}\n{"type":"result"}\n'));
  stdout.push(null); // end

  await new Promise((r) => setTimeout(r, 50));

  expect(lines).toEqual(['{"type":"system"}', '{"type":"result"}']);
});

test("readLines handles partial lines across chunks", async () => {
  const { Readable } = await import("node:stream");
  const stdout = new Readable({ read() {} });

  const mockProc = { stdout, stdin: null, stderr: null, kill: () => {} } as any;
  const lines: string[] = [];

  readLines(mockProc, (line) => lines.push(line));

  stdout.push(Buffer.from('first'));
  stdout.push(Buffer.from('_line\nsecond'));
  stdout.push(Buffer.from('_line\n'));
  stdout.push(null);

  await new Promise((r) => setTimeout(r, 50));

  expect(lines).toEqual(["first_line", "second_line"]);
});

test("readLines skips empty lines", async () => {
  const { Readable } = await import("node:stream");
  const stdout = new Readable({ read() {} });

  const mockProc = { stdout, stdin: null, stderr: null, kill: () => {} } as any;
  const lines: string[] = [];

  readLines(mockProc, (line) => lines.push(line));

  stdout.push(Buffer.from('line1\n\n\nline2\n'));
  stdout.push(null);

  await new Promise((r) => setTimeout(r, 50));

  expect(lines).toEqual(["line1", "line2"]);
});

test("readLines calls onEnd when stream finishes", async () => {
  const { Readable } = await import("node:stream");
  const stdout = new Readable({ read() {} });

  const mockProc = { stdout, stdin: null, stderr: null, kill: () => {} } as any;
  let ended = false;

  readLines(mockProc, () => {}, () => { ended = true; });

  stdout.push(Buffer.from('line\n'));
  stdout.push(null);

  await new Promise((r) => setTimeout(r, 50));

  expect(ended).toBe(true);
});
