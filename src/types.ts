// --- Core types ---

export type CLIType = "claude" | "codex";

export interface Message {
  role: "user" | "assistant";
  text: string;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  cwd: string;
  cli: CLIType;
  cliSessionId: string | null;
  messages: Message[];
}

export interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  cwd: string;
  cli: CLIType;
  messageCount: number;
  alive: boolean;
}

// --- Options ---

export interface RotomOptions {
  dataDir: string;
}

export interface CreateSessionOptions {
  cwd: string;
  cli: CLIType;
  adapter?: ClaudeAdapterOptions | CodexAdapterOptions;
}

export interface ClaudeAdapterOptions {
  skipPermissions?: boolean; // default: true
  verbose?: boolean; // default: true
  extraArgs?: string[];
}

export interface CodexAdapterOptions {
  bypassApprovals?: boolean; // default: true
  skipGitRepoCheck?: boolean; // default: true
  extraArgs?: string[];
}

// --- Responses API event types ---

export interface ResponseCreatedEvent {
  type: "response.created";
}

export interface ResponseInProgressEvent {
  type: "response.in_progress";
}

export interface ResponseCompletedEvent {
  type: "response.completed";
}

export interface ResponseFailedEvent {
  type: "response.failed";
  error: string;
}

export interface OutputItemMessageData {
  type: "message";
  role: "assistant";
}

export interface OutputItemReasoningData {
  type: "reasoning";
  text?: string;
}

export interface OutputItemFunctionCallData {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
}

export type OutputItemData =
  | OutputItemMessageData
  | OutputItemReasoningData
  | OutputItemFunctionCallData;

export interface ResponseOutputItemAddedEvent {
  type: "response.output_item.added";
  item: OutputItemData;
}

export interface ResponseOutputItemDoneEvent {
  type: "response.output_item.done";
  item: OutputItemData;
}

export interface ResponseOutputTextDeltaEvent {
  type: "response.output_text.delta";
  delta: string;
}

export interface ResponseOutputTextDoneEvent {
  type: "response.output_text.done";
  text: string;
}

export type RotomEvent =
  | ResponseCreatedEvent
  | ResponseInProgressEvent
  | ResponseCompletedEvent
  | ResponseFailedEvent
  | ResponseOutputItemAddedEvent
  | ResponseOutputItemDoneEvent
  | ResponseOutputTextDeltaEvent
  | ResponseOutputTextDoneEvent;

// --- Internal adapter types ---

/** @internal */
export interface InternalAdapter {
  send(text: string): void;
  kill(): void;
}

/** @internal */
export interface AdapterConfig {
  cwd: string;
  cliSessionId: string | null;
  adapterOptions?: ClaudeAdapterOptions | CodexAdapterOptions;
}

/** @internal */
export type AdapterEmit = (event: RotomEvent) => void;

/** @internal */
export type AdapterInitCallback = (data: { cliSessionId?: string }) => void;
