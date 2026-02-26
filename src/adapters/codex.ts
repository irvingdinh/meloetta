import { type ChildProcess, spawn } from "node:child_process";

import type {
  AdapterConfig,
  AdapterEmit,
  AdapterInitCallback,
  CodexAdapterOptions,
  InternalAdapter,
} from "../types.js";
import { generateCallId, readLines } from "./base.js";

export function createCodexAdapter(
  config: AdapterConfig,
  emit: AdapterEmit,
  onInit: AdapterInitCallback,
): InternalAdapter {
  const opts = (config.adapterOptions ?? {}) as CodexAdapterOptions;
  let currentProc: ChildProcess | null = null;
  let killed = false;

  function spawnTurn(text: string) {
    const args = ["exec"];

    if (config.cliSessionId) {
      args.push("resume", "--json");
      if (opts.bypassApprovals !== false)
        args.push("--dangerously-bypass-approvals-and-sandbox");
      if (opts.skipGitRepoCheck !== false) args.push("--skip-git-repo-check");
      if (opts.extraArgs) args.push(...opts.extraArgs);
      args.push(config.cliSessionId, text);
    } else {
      args.push("--json");
      if (opts.bypassApprovals !== false)
        args.push("--dangerously-bypass-approvals-and-sandbox");
      if (opts.skipGitRepoCheck !== false) args.push("--skip-git-repo-check");
      args.push("-C", config.cwd);
      if (opts.extraArgs) args.push(...opts.extraArgs);
      args.push(text);
    }

    const proc = spawn("codex", args, {
      cwd: config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    currentProc = proc;

    proc.on("error", (err) => {
      if (!killed) {
        emit({ type: "response.failed", error: err.message });
      }
    });

    proc.on("exit", (code) => {
      currentProc = null;
      if (!killed && code !== 0 && code !== null) {
        emit({
          type: "response.failed",
          error: `codex process exited with code ${code}`,
        });
      }
    });

    readLines(
      proc,
      (line) => {
        try {
          const data = JSON.parse(line);

          // Thread started
          if (data.type === "thread.started" && data.thread_id) {
            if (!config.cliSessionId) {
              config.cliSessionId = data.thread_id;
              onInit({ cliSessionId: data.thread_id });
            }
            emit({ type: "response.created" });
            emit({ type: "response.in_progress" });
            return;
          }

          // Reasoning
          if (
            data.type === "item.completed" &&
            data.item?.type === "reasoning"
          ) {
            emit({
              type: "response.output_item.added",
              item: {
                type: "reasoning",
                text: (data.item.text || "").slice(0, 200),
              },
            });
            emit({
              type: "response.output_item.done",
              item: {
                type: "reasoning",
                text: (data.item.text || "").slice(0, 200),
              },
            });
            return;
          }

          // Command execution started
          if (
            data.type === "item.started" &&
            data.item?.type === "command_execution"
          ) {
            const callId = generateCallId();
            emit({
              type: "response.output_item.added",
              item: {
                type: "function_call",
                name: "command_execution",
                arguments: JSON.stringify({
                  command: data.item.command || "",
                }),
                call_id: callId,
              },
            });
            return;
          }

          // Command execution completed
          if (
            data.type === "item.completed" &&
            data.item?.type === "command_execution"
          ) {
            const callId = generateCallId();
            emit({
              type: "response.output_item.done",
              item: {
                type: "function_call",
                name: "command_execution",
                arguments: JSON.stringify({
                  command: data.item.command || "",
                  exit_code: data.item.exit_code,
                }),
                call_id: callId,
              },
            });
            return;
          }

          // Agent text message (codex sends complete text, not streamed)
          if (
            data.type === "item.completed" &&
            data.item?.type === "agent_message"
          ) {
            const text = data.item.text || "";
            if (text) {
              emit({ type: "response.output_text.delta", delta: text });
            }
            return;
          }

          // Turn complete
          if (data.type === "turn.completed") {
            emit({ type: "response.completed" });
            return;
          }
        } catch {
          // malformed JSON line — skip
        }
      },
      () => {
        currentProc = null;
      },
    );
  }

  // Codex is ready immediately (process spawns per-turn)
  emit({ type: "response.created" });

  return {
    send(text: string) {
      spawnTurn(text);
    },
    kill() {
      killed = true;
      try {
        currentProc?.kill();
      } catch {
        // already dead
      }
    },
  };
}
