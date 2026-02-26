import { spawn } from "node:child_process";

import type {
  AdapterConfig,
  AdapterEmit,
  AdapterInitCallback,
  ClaudeAdapterOptions,
  InternalAdapter,
} from "../types.js";
import { generateCallId, readLines } from "./base.js";

export function createClaudeAdapter(
  config: AdapterConfig,
  emit: AdapterEmit,
  onInit: AdapterInitCallback,
): InternalAdapter {
  const opts = (config.adapterOptions ?? {}) as ClaudeAdapterOptions;

  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
  ];

  if (opts.verbose !== false) args.push("--verbose");
  if (opts.skipPermissions !== false)
    args.push("--dangerously-skip-permissions");
  if (config.cliSessionId) args.push("--resume", config.cliSessionId);
  if (opts.extraArgs) args.push(...opts.extraArgs);

  const proc = spawn("claude", args, {
    cwd: config.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let killed = false;

  proc.on("error", (err) => {
    if (!killed) {
      emit({ type: "response.failed", error: err.message });
    }
  });

  proc.on("exit", (code) => {
    if (!killed && code !== 0 && code !== null) {
      emit({
        type: "response.failed",
        error: `claude process exited with code ${code}`,
      });
    }
  });

  readLines(proc, (line) => {
    try {
      const data = JSON.parse(line);

      // Init
      if (data.type === "system" && data.subtype === "init") {
        if (data.session_id) {
          onInit({ cliSessionId: data.session_id });
        }
        emit({ type: "response.created" });
        emit({ type: "response.in_progress" });
        return;
      }

      // Thinking start
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

      // Tool use start (streaming)
      if (
        data.type === "stream_event" &&
        data.event?.type === "content_block_start" &&
        data.event?.content_block?.type === "tool_use"
      ) {
        const callId = generateCallId();
        emit({
          type: "response.output_item.added",
          item: {
            type: "function_call",
            name: data.event.content_block.name || "unknown",
            arguments: "",
            call_id: callId,
          },
        });
        return;
      }

      // Full assistant message with tool_use blocks
      if (data.type === "assistant" && data.message?.content) {
        for (const block of data.message.content) {
          if (block.type === "tool_use") {
            const callId = generateCallId();
            const args = JSON.stringify(block.input ?? {});
            emit({
              type: "response.output_item.added",
              item: {
                type: "function_call",
                name: block.name,
                arguments: args,
                call_id: callId,
              },
            });
            emit({
              type: "response.output_item.done",
              item: {
                type: "function_call",
                name: block.name,
                arguments: args,
                call_id: callId,
              },
            });
          }
        }
        return;
      }

      // Tool result — tool execution completed on the CLI side
      if (data.type === "user" && data.tool_use_result !== undefined) {
        return;
      }

      // Text delta
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

      // Turn complete
      if (data.type === "result") {
        emit({ type: "response.completed" });
        return;
      }
    } catch {
      // malformed JSON line — skip
    }
  });

  return {
    send(text: string) {
      const input = JSON.stringify({
        type: "user",
        message: { role: "user", content: text },
      });
      proc.stdin?.write(input + "\n");
    },
    kill() {
      killed = true;
      try {
        proc.kill();
      } catch {
        // already dead
      }
    },
  };
}
