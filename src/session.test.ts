import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "bun:test";

import { Session } from "./session.js";
import type { SessionMeta } from "./types.js";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "rotom-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function createTestMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: "test-001",
    title: "",
    createdAt: Date.now(),
    cwd: "/tmp",
    cli: "claude",
    cliSessionId: null,
    messages: [],
    ...overrides,
  };
}

test("Session constructor sets properties correctly", () => {
  const meta = createTestMeta({ id: "abc", cwd: "/home/user", cli: "codex" });
  const session = new Session({ meta, dataDir });

  expect(session.id).toBe("abc");
  expect(session.cwd).toBe("/home/user");
  expect(session.cli).toBe("codex");
  expect(session.alive).toBe(false);
  expect(session.messages.length).toBe(0);
});

test("Session info() returns correct shape", () => {
  const meta = createTestMeta({
    id: "xyz",
    title: "My session",
    cwd: "/project",
    cli: "claude",
    messages: [
      { role: "user", text: "hello" },
      { role: "assistant", text: "hi" },
    ],
  });
  const session = new Session({ meta, dataDir });

  const info = session.info();
  expect(info).toEqual({
    id: "xyz",
    title: "My session",
    createdAt: meta.createdAt,
    cwd: "/project",
    cli: "claude",
    messageCount: 2,
    alive: false,
  });
});

test("Session info() shows 'New session' when title is empty", () => {
  const session = new Session({ meta: createTestMeta({ title: "" }), dataDir });
  expect(session.info().title).toBe("New session");
});

test("Session toMeta() returns session metadata", () => {
  const meta = createTestMeta({
    id: "m1",
    title: "Test",
    cwd: "/test",
    cli: "codex",
    cliSessionId: "thread-123",
    messages: [{ role: "user", text: "hello" }],
  });
  const session = new Session({ meta, dataDir });

  const result = session.toMeta();
  expect(result.id).toBe("m1");
  expect(result.title).toBe("Test");
  expect(result.cli).toBe("codex");
  expect(result.cliSessionId).toBe("thread-123");
  expect(result.messages).toEqual([{ role: "user", text: "hello" }]);
});

test("Session messages are a copy (not shared reference)", () => {
  const originalMessages = [{ role: "user" as const, text: "hello" }];
  const meta = createTestMeta({ messages: originalMessages });
  const session = new Session({ meta, dataDir });

  // Mutating original should not affect session
  originalMessages.push({ role: "assistant" as const, text: "hi" });
  expect(session.messages.length).toBe(1);
});

test("Session kill() when no adapter is a no-op", () => {
  const session = new Session({ meta: createTestMeta(), dataDir });
  expect(session.alive).toBe(false);
  session.kill(); // should not throw
  expect(session.alive).toBe(false);
});
