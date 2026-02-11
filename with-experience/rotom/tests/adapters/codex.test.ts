import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterEmit, AdapterInitCallback, RotomEvent } from "../../src/types.js";

// Simulate Codex CLI output parsing (mirrors createCodexAdapter logic)

let callCounter = 0;
function testCallId(): string {
  return `test_call_${++callCounter}`;
}

function parseCodexLine(
  line: string,
  emit: AdapterEmit,
  onInit: AdapterInitCallback,
  config: { cliSessionId: string | null },
): void {
  try {
    const data = JSON.parse(line);

    if (data.type === "thread.started" && data.thread_id) {
      if (!config.cliSessionId) {
        config.cliSessionId = data.thread_id;
        onInit({ cliSessionId: data.thread_id });
      }
      emit({ type: "response.created" });
      emit({ type: "response.in_progress" });
      return;
    }

    if (data.type === "item.completed" && data.item?.type === "reasoning") {
      const text = (data.item.text || "").slice(0, 200);
      emit({
        type: "response.output_item.added",
        item: { type: "reasoning", text },
      });
      emit({
        type: "response.output_item.done",
        item: { type: "reasoning", text },
      });
      return;
    }

    if (data.type === "item.started" && data.item?.type === "command_execution") {
      emit({
        type: "response.output_item.added",
        item: {
          type: "function_call",
          name: "command_execution",
          arguments: JSON.stringify({ command: data.item.command || "" }),
          call_id: testCallId(),
        },
      });
      return;
    }

    if (data.type === "item.completed" && data.item?.type === "command_execution") {
      emit({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          name: "command_execution",
          arguments: JSON.stringify({
            command: data.item.command || "",
            exit_code: data.item.exit_code,
          }),
          call_id: testCallId(),
        },
      });
      return;
    }

    if (data.type === "item.completed" && data.item?.type === "agent_message") {
      const text = data.item.text || "";
      if (text) {
        emit({ type: "response.output_text.delta", delta: text });
      }
      return;
    }

    if (data.type === "turn.completed") {
      emit({ type: "response.completed" });
      return;
    }
  } catch {
    // skip
  }
}

test("Codex adapter parses fixture into correct Responses API events", () => {
  callCounter = 0;
  const fixturePath = join(import.meta.dir, "../fixtures/codex-turn.jsonl");
  const lines = readFileSync(fixturePath, "utf-8").split("\n").filter((l) => l.trim());

  const events: RotomEvent[] = [];
  let initData: { cliSessionId?: string } | null = null;
  const config = { cliSessionId: null as string | null };

  const emit: AdapterEmit = (event) => events.push(event);
  const onInit: AdapterInitCallback = (data) => {
    initData = data;
  };

  for (const line of lines) {
    parseCodexLine(line, emit, onInit, config);
  }

  // Check init
  expect(initData).not.toBeNull();
  expect(initData!.cliSessionId).toBe("thread_xyz789");
  expect(config.cliSessionId).toBe("thread_xyz789");

  // Check event sequence
  const types = events.map((e) => e.type);
  expect(types).toEqual([
    "response.created",
    "response.in_progress",
    "response.output_item.added",   // reasoning
    "response.output_item.done",    // reasoning done
    "response.output_item.added",   // command_execution start
    "response.output_item.done",    // command_execution done
    "response.output_text.delta",   // agent_message
    "response.completed",
  ]);
});

test("Codex reasoning events carry text", () => {
  callCounter = 0;
  const events: RotomEvent[] = [];
  const config = { cliSessionId: null as string | null };

  parseCodexLine(
    JSON.stringify({
      type: "item.completed",
      item: { type: "reasoning", text: "Let me think about this carefully" },
    }),
    (e) => events.push(e),
    () => {},
    config,
  );

  expect(events.length).toBe(2);
  const added = events[0]!;
  if (added.type === "response.output_item.added" && added.item.type === "reasoning") {
    expect(added.item.text).toBe("Let me think about this carefully");
  }
});

test("Codex command_execution normalized as function_call", () => {
  callCounter = 0;
  const events: RotomEvent[] = [];
  const config = { cliSessionId: null as string | null };

  parseCodexLine(
    JSON.stringify({
      type: "item.started",
      item: { type: "command_execution", command: "npm test" },
    }),
    (e) => events.push(e),
    () => {},
    config,
  );

  expect(events.length).toBe(1);
  const event = events[0]!;
  if (event.type === "response.output_item.added" && event.item.type === "function_call") {
    expect(event.item.name).toBe("command_execution");
    expect(JSON.parse(event.item.arguments)).toEqual({ command: "npm test" });
  }
});

test("Codex command_execution done includes exit_code", () => {
  callCounter = 0;
  const events: RotomEvent[] = [];
  const config = { cliSessionId: null as string | null };

  parseCodexLine(
    JSON.stringify({
      type: "item.completed",
      item: { type: "command_execution", command: "npm test", exit_code: 1 },
    }),
    (e) => events.push(e),
    () => {},
    config,
  );

  expect(events.length).toBe(1);
  const event = events[0]!;
  if (event.type === "response.output_item.done" && event.item.type === "function_call") {
    const args = JSON.parse(event.item.arguments);
    expect(args.exit_code).toBe(1);
  }
});

test("Codex agent_message emitted as text delta", () => {
  callCounter = 0;
  const events: RotomEvent[] = [];
  const config = { cliSessionId: null as string | null };

  parseCodexLine(
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "The files are listed above." },
    }),
    (e) => events.push(e),
    () => {},
    config,
  );

  expect(events.length).toBe(1);
  if (events[0]!.type === "response.output_text.delta") {
    expect(events[0]!.delta).toBe("The files are listed above.");
  }
});

test("Codex empty agent_message is skipped", () => {
  callCounter = 0;
  const events: RotomEvent[] = [];
  const config = { cliSessionId: null as string | null };

  parseCodexLine(
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "" },
    }),
    (e) => events.push(e),
    () => {},
    config,
  );

  expect(events.length).toBe(0);
});
