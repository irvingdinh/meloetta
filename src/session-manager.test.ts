import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "bun:test";

import { Rotom } from "./session-manager.js";
import type { SessionMeta } from "./types.js";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "rotom-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test("Rotom load() with empty directory", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();
  expect(rotom.list()).toEqual([]);
  rotom.close();
});

test("Rotom load() reads existing session files", async () => {
  const meta: SessionMeta = {
    id: "loaded-1",
    title: "Previously saved",
    createdAt: 1000,
    cwd: "/old/project",
    cli: "claude",
    cliSessionId: "session-abc",
    messages: [{ role: "user", text: "hello" }],
  };
  await writeFile(join(dataDir, "loaded-1.json"), JSON.stringify(meta));

  const rotom = new Rotom({ dataDir });
  await rotom.load();

  const sessions = rotom.list();
  expect(sessions.length).toBe(1);
  expect(sessions[0]!.id).toBe("loaded-1");
  expect(sessions[0]!.title).toBe("Previously saved");
  expect(sessions[0]!.cwd).toBe("/old/project");
  expect(sessions[0]!.cli).toBe("claude");
  expect(sessions[0]!.messageCount).toBe(1);
  expect(sessions[0]!.alive).toBe(false);

  rotom.close();
});

test("Rotom load() skips malformed JSON files", async () => {
  await writeFile(join(dataDir, "bad.json"), "not json!!!");

  const meta: SessionMeta = {
    id: "good-1",
    title: "Good session",
    createdAt: 1000,
    cwd: "/project",
    cli: "codex",
    cliSessionId: null,
    messages: [],
  };
  await writeFile(join(dataDir, "good-1.json"), JSON.stringify(meta));

  const rotom = new Rotom({ dataDir });
  await rotom.load();

  expect(rotom.list().length).toBe(1);
  expect(rotom.list()[0]!.id).toBe("good-1");

  rotom.close();
});

test("Rotom create() returns a session", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();

  const session = await rotom.create({ cwd: "/my/project", cli: "claude" });

  expect(session.id).toBeTruthy();
  expect(session.cwd).toBe("/my/project");
  expect(session.cli).toBe("claude");
  expect(session.alive).toBe(false); // adapter not spawned yet (lazy)

  expect(rotom.list().length).toBe(1);
  expect(rotom.list()[0]!.id).toBe(session.id);

  rotom.close();
});

test("Rotom get() returns the correct session", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();

  const session = await rotom.create({ cwd: "/project", cli: "codex" });

  expect(rotom.get(session.id)).toBe(session);
  expect(rotom.get("nonexistent")).toBeUndefined();

  rotom.close();
});

test("Rotom destroy() removes session", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();

  const session = await rotom.create({ cwd: "/project", cli: "claude" });
  const id = session.id;

  expect(rotom.list().length).toBe(1);

  await rotom.destroy(id);

  expect(rotom.list().length).toBe(0);
  expect(rotom.get(id)).toBeUndefined();

  rotom.close();
});

test("Rotom destroy() nonexistent session is a no-op", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();

  await rotom.destroy("nonexistent"); // should not throw

  rotom.close();
});

test("Rotom close() cleans up", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();

  await rotom.create({ cwd: "/project", cli: "claude" });

  rotom.close(); // should not throw
});

test("Rotom create() persists to disk", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();

  const session = await rotom.create({ cwd: "/project", cli: "codex" });

  // Read the file directly
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(join(dataDir, `${session.id}.json`), "utf-8");
  const meta = JSON.parse(raw);

  expect(meta.id).toBe(session.id);
  expect(meta.cwd).toBe("/project");
  expect(meta.cli).toBe("codex");

  rotom.close();
});

test("Rotom load() defaults missing cli to claude", async () => {
  const meta = {
    id: "old-session",
    title: "Legacy",
    createdAt: 1000,
    cwd: "/project",
    cliSessionId: null,
    messages: [],
    // no cli field — old format
  };
  await writeFile(join(dataDir, "old-session.json"), JSON.stringify(meta));

  const rotom = new Rotom({ dataDir });
  await rotom.load();

  expect(rotom.list()[0]!.cli).toBe("claude");

  rotom.close();
});

test("Rotom multiple creates have unique IDs", async () => {
  const rotom = new Rotom({ dataDir });
  await rotom.load();

  const s1 = await rotom.create({ cwd: "/a", cli: "claude" });
  const s2 = await rotom.create({ cwd: "/b", cli: "codex" });
  const s3 = await rotom.create({ cwd: "/c", cli: "claude" });

  expect(s1.id).not.toBe(s2.id);
  expect(s2.id).not.toBe(s3.id);
  expect(s1.id).not.toBe(s3.id);

  expect(rotom.list().length).toBe(3);

  rotom.close();
});
