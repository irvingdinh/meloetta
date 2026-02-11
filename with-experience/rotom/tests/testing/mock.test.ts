import { test, expect, beforeEach } from "bun:test";
import { createMockSession } from "../../src/testing/mock.js";
import type { RotomEvent } from "../../src/types.js";

const BASIC_EVENTS: RotomEvent[] = [
  { type: "response.created" },
  { type: "response.in_progress" },
  { type: "response.output_text.delta", delta: "Hello " },
  { type: "response.output_text.delta", delta: "world" },
  { type: "response.completed" },
];

test("createMockSession replays events on send()", async () => {
  const session = createMockSession(BASIC_EVENTS);
  const received: string[] = [];

  session.on("response.created", () => received.push("created"));
  session.on("response.in_progress", () => received.push("in_progress"));
  session.on("response.output_item.added", (e) => received.push(`item_added:${e.item.type}`));
  session.on("response.output_text.delta", (e) => received.push(`delta:${e.delta}`));
  session.on("response.output_text.done", (e) => received.push(`text_done:${e.text}`));
  session.on("response.output_item.done", (e) => received.push(`item_done:${e.item.type}`));
  session.on("response.completed", () => received.push("completed"));

  session.send("hi");

  // Wait for async event replay
  await new Promise((r) => setTimeout(r, 50));

  expect(received).toEqual([
    "created",
    "in_progress",
    "item_added:message",
    "delta:Hello ",
    "delta:world",
    "text_done:Hello world",
    "item_done:message",
    "completed",
  ]);
});

test("mock session tracks messages", async () => {
  const session = createMockSession(BASIC_EVENTS);

  expect(session.messages.length).toBe(0);

  session.send("hello");
  await new Promise((r) => setTimeout(r, 50));

  expect(session.messages.length).toBe(2);
  expect(session.messages[0]).toEqual({ role: "user", text: "hello" });
  expect(session.messages[1]).toEqual({ role: "assistant", text: "Hello world" });
});

test("mock session alive state transitions", async () => {
  const session = createMockSession(BASIC_EVENTS);

  expect(session.alive).toBe(false);

  session.send("hi");
  expect(session.alive).toBe(true);

  await new Promise((r) => setTimeout(r, 50));
  expect(session.alive).toBe(false); // completed
});

test("mock session kill sets alive to false", () => {
  const session = createMockSession(BASIC_EVENTS);
  session.send("hi");
  expect(session.alive).toBe(true);
  session.kill();
  expect(session.alive).toBe(false);
});

test("mock session info()", () => {
  const session = createMockSession({
    id: "test-123",
    cwd: "/home/user/project",
    cli: "codex",
    events: BASIC_EVENTS,
  });

  const info = session.info();
  expect(info.id).toBe("test-123");
  expect(info.cwd).toBe("/home/user/project");
  expect(info.cli).toBe("codex");
  expect(info.messageCount).toBe(0);
});

test("mock session with function_call events", async () => {
  const events: RotomEvent[] = [
    { type: "response.created" },
    { type: "response.in_progress" },
    {
      type: "response.output_item.added",
      item: {
        type: "function_call",
        name: "Bash",
        arguments: '{"command":"ls -la"}',
        call_id: "call_1",
      },
    },
    {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        name: "Bash",
        arguments: '{"command":"ls -la"}',
        call_id: "call_1",
      },
    },
    { type: "response.output_text.delta", delta: "Here are the files." },
    { type: "response.completed" },
  ];

  const session = createMockSession(events);
  const received: string[] = [];

  session.on("response.output_item.added", (e) => {
    if (e.item.type === "function_call") {
      received.push(`tool:${e.item.name}:${e.item.arguments}`);
    } else {
      received.push(`item:${e.item.type}`);
    }
  });
  session.on("response.output_text.delta", (e) => received.push(`delta:${e.delta}`));
  session.on("response.completed", () => received.push("completed"));

  session.send("list files");
  await new Promise((r) => setTimeout(r, 50));

  expect(received).toEqual([
    'tool:Bash:{"command":"ls -la"}',
    "item:message",
    "delta:Here are the files.",
    "completed",
  ]);
});

test("mock session with reasoning events", async () => {
  const events: RotomEvent[] = [
    { type: "response.created" },
    { type: "response.in_progress" },
    {
      type: "response.output_item.added",
      item: { type: "reasoning", text: "Let me think..." },
    },
    { type: "response.output_text.delta", delta: "The answer is 42." },
    { type: "response.completed" },
  ];

  const session = createMockSession(events);
  const received: string[] = [];

  session.on("response.output_item.added", (e) => received.push(`item:${e.item.type}`));
  session.on("response.output_text.delta", (e) => received.push(`delta:${e.delta}`));

  session.send("what is the meaning of life?");
  await new Promise((r) => setTimeout(r, 50));

  expect(received).toEqual([
    "item:reasoning",
    "item:message",
    "delta:The answer is 42.",
  ]);
});

test("mock session with delay option", async () => {
  const session = createMockSession({
    events: BASIC_EVENTS,
    delay: 10,
  });

  const received: string[] = [];
  session.on("response.created", () => received.push("created"));
  session.on("response.completed", () => received.push("completed"));

  session.send("hi");

  // Should not have events yet (delay = 10ms)
  expect(received.length).toBe(0);

  await new Promise((r) => setTimeout(r, 100));
  expect(received).toContain("created");
  expect(received).toContain("completed");
});

test("mock session failed event", async () => {
  const events: RotomEvent[] = [
    { type: "response.created" },
    { type: "response.in_progress" },
    { type: "response.failed", error: "process crashed" },
  ];

  const session = createMockSession(events);
  let failError = "";

  session.on("response.failed", (e) => {
    failError = e.error;
  });

  session.send("hi");
  await new Promise((r) => setTimeout(r, 50));

  expect(failError).toBe("process crashed");
  expect(session.alive).toBe(false);
});
