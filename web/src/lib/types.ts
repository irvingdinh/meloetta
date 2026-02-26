export type CLIType = "claude" | "codex";

export interface Message {
  role: "user" | "assistant";
  text: string;
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

export interface SessionDetail extends SessionInfo {
  messages: Message[];
  isGit: boolean;
}

export interface AppConfig {
  cwd: string;
  cli: CLIType;
}

export interface BrowseEntry {
  name: string;
  isDir: boolean;
}

export interface BrowseResult {
  path: string;
  entries: BrowseEntry[];
  config: AppConfig;
}

export interface DiffLine {
  type: "context" | "addition" | "deletion" | "hunk_header";
  content: string;
  oldNum?: number;
  newNum?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked" | "binary";
  hunks: DiffHunk[];
  truncated?: boolean;
}

export interface DiffResult {
  files: DiffFile[];
  stats: { files: number; additions: number; deletions: number };
}

// SSE event types

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
