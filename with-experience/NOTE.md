# Meloetta - Product & Feature Specification

> A web-based session manager for AI coding assistants.
> This document describes what the product does — not how it is built. An engineer reading this should be able to rebuild the entire product using any technology stack and integration approach of their choice.

---

## 1. What Is Meloetta

Meloetta is a **local-only, browser-based application** that lets a developer manage multiple concurrent conversations with AI coding assistants from a single interface.

Think of it as a lightweight, self-hosted "chat manager" for AI pair-programming — similar to how a terminal multiplexer manages multiple shell sessions, but for AI coding conversations.

---

## 2. Supported AI Backends

The application supports multiple AI coding assistant backends. Each backend is treated uniformly from the user's perspective — same UI, same features — regardless of how the backend works internally.

The currently supported backends are:

| Backend | Provider |
|---------|----------|
| **Claude** | Anthropic |
| **Codex** | OpenAI |

The system is designed to be extensible — adding a new backend should not require changes to the UI or session management logic.

All backends produce the same types of output from the user's perspective:
- **Streaming text responses** — the assistant's reply, delivered incrementally.
- **Tool/function invocations** — actions the assistant takes (reading files, editing code, running commands, searching, etc.).
- **Reasoning/thinking blocks** — the assistant's internal reasoning process.

---

## 3. Core Concepts

### 3.1 Session

A session represents a single ongoing conversation with one AI backend. A session has:

- **Unique ID** — auto-generated short random identifier.
- **Working directory** — the filesystem directory the AI operates in. Chosen by the user at creation. Immutable after creation.
- **Backend** — which AI assistant (e.g., Claude or Codex). Chosen at creation. Immutable.
- **Title** — auto-generated from the first user message (first 80 characters). Not user-editable.
- **Message history** — ordered list of user and assistant messages.
- **Active status** — whether the AI backend is currently connected and ready for this session.
- **Creation timestamp**.

### 3.2 Lazy Activation

The AI backend connection is **not** established when a session is created. It only activates when the user sends the **first message**. Creating a session is instant and free of side effects.

### 3.3 Auto-Resume

If a session's backend connection is lost (idle timeout, application restart, error), it is automatically re-established when the user sends the next message. The conversation history is preserved and the AI resumes where it left off.

### 3.4 Idle Timeout

Sessions that have been idle (no user messages) for a configurable duration (default: 5 minutes) have their backend connection automatically closed. The session itself is preserved — only the active connection is terminated. It will resume on the next message.

### 3.5 Real-Time Streaming

AI responses are streamed to the browser in real time as they are produced. The user sees text appear incrementally and tool invocations appear as they happen.

### 3.6 Multi-Client Support

Multiple browser tabs or clients can view the same session simultaneously. All connected clients receive the same real-time events. Any client can send messages.

---

## 4. Features

### 4.1 Session List (Home Screen)

The home screen shows all sessions, sorted newest first.

**Each session row displays:**
- Session title (bold, truncated if long)
- Backend badge (e.g., "claude" or "codex")
- Working directory path
- Relative time since creation (e.g., "2m ago", "3h ago")
- Status indicator:
  - **Green dot with glow animation** — session is active (backend connected)
  - **Gray dot** — session is inactive
- Delete button — hidden by default, appears on hover (always visible on mobile)

**Empty state:** When no sessions exist, shows centered "no sessions" text.

**New session button:** A "+ new" button in the header opens the folder picker.

### 4.2 Folder Picker (New Session Dialog)

A modal dialog for creating a new session. Guides the user through selecting a working directory and AI backend.

**Components:**
- **Current path display** — shows the full path of the currently browsed directory. When the path is too long to fit, the deepest (rightmost) portion remains visible and the leftmost portion is clipped.
- **Parent directory button** ("..") — navigates one level up. Hidden when already at the filesystem root.
- **Directory listing** — scrollable list of subdirectories at the current location. Only directories are shown, no files. Hidden files/folders (dotfiles) are excluded. Sorted alphabetically. Shows "empty" when no subdirectories exist.
- **Backend toggle** — mutually exclusive options for each supported backend (e.g., "claude" and "codex"). The selected one is visually highlighted.
- **"Start session" button** — creates the session with the selected directory and backend, then navigates into it.
- **"Cancel" button** — closes the modal without creating anything.

**Remembered defaults:**
- The application remembers the last-used directory and backend selection across sessions. When the folder picker opens, it pre-navigates to the last-used directory and pre-selects the last-used backend.
- These defaults update whenever the user creates a session or browses to a new directory.

### 4.3 Chat View

The main conversation interface for a session.

#### 4.3.1 Header

- **Back button** (left arrow) — returns to the session list.
- **Menu button** (three dots) — opens a dropdown with session details and actions.

#### 4.3.2 Dropdown Menu

- Session title (read-only)
- Working directory path (read-only)
- Backend badge (read-only)
- **"Changes" button** — only visible if the session's working directory is a git repository. Opens the diff overlay (see 4.4).
- **"Delete session" button** (red) — permanently deletes the session and returns to the list.

#### 4.3.3 Message Display

Messages are shown in a scrollable area:

- **User messages** — each line is visually prefixed with `> ` (blockquote style). Displayed in a slightly contrasting background.
- **Assistant messages** — displayed in the theme's accent color (amber/phosphor in dark mode).
- **Tool invocations** — displayed inline as compact summary lines prefixed with `~ `. Each tool call is summarized based on what it does (see 4.3.5).
- **Reasoning/thinking blocks** — displayed as "thinking..." text.
- **Streaming indicator** — while the assistant is actively responding, the current message has slightly reduced opacity to indicate it is still in progress.

#### 4.3.4 Auto-Scroll Behavior

- When the user is near the bottom of the message area (within ~80px), new content auto-scrolls into view.
- If the user has scrolled up to review earlier content, auto-scroll is suppressed so they are not yanked away.

#### 4.3.5 Tool Call Summaries

When the AI invokes tools, they are shown inline as single-line summaries rather than raw data. The summary format depends on the tool type:

| Tool Action | What Is Shown |
|-------------|---------------|
| Run a shell command | The command description, or first 80 characters of the command |
| Read a file | The file path |
| Edit a file | The file path |
| Write/create a file | The file path |
| Search file contents | The search pattern |
| Search for files by name | The file pattern |
| Web search | The search query |
| Fetch a URL | The URL |
| Update task list | "update tasks" |
| Any other tool | The tool's name |
| Reasoning/thinking | "thinking..." |

#### 4.3.6 Input Area

- **Text input** — multi-line text area that auto-expands as the user types (minimum ~40px height, maximum ~120px height). Monospace font.
- **Send button** — right-aligned next to the input.
- **Keyboard shortcut** — Cmd+Enter (Mac) or Ctrl+Enter sends the message.
- **Disabled state** — while the assistant is streaming a response, both the input and send button are disabled. The user cannot send another message until the current response completes.

### 4.4 Git Diff Overlay

A full-screen overlay that shows all uncommitted changes in the session's working directory. Only available for sessions whose working directory is a git repository.

#### 4.4.1 Toolbar

- **Close button** (x)
- **Title:** "uncommitted changes"
- **Summary stats:** total number of changed files, total additions (green), total deletions (red)

#### 4.4.2 File Navigation Chips

A horizontal scrollable row of file name chips. Clicking a chip scrolls the file list to jump to that file.

#### 4.4.3 File List

Each changed file is shown as a collapsible section:

**File header (clickable to expand/collapse):**
- Expand/collapse arrow indicator
- File path
- Status badge with color coding:
  - **Modified** — blue
  - **Added / Untracked** — green
  - **Deleted** — red
  - **Renamed** — yellow
  - **Binary** — gray
- Line change summary (e.g., "+12 / -3")

**File diff (when expanded):**
- Standard unified diff display with side-by-side line numbers (old and new)
- Added lines — green background
- Deleted lines — red background
- Context lines — neutral background
- Hunk headers shown (indicating the location of changes within the file)

**Limits:**
- Files with more than 2,000 diff lines show a truncation notice instead of the full diff.
- Untracked files larger than 50KB are skipped entirely.

**What is included in the diff:**
- All staged and unstaged changes compared to the last commit (or the staging area in repos with no commits yet)
- All untracked files (not ignored by .gitignore), shown as fully-added diffs

**Keyboard:** Pressing Escape closes the overlay.

### 4.5 Session Persistence & Recovery

- Every session's metadata and full conversation history is automatically saved to disk.
- Saves happen after every user message and after every completed assistant response.
- On application restart, all sessions are restored from disk. They appear in the session list in their inactive state (gray dot).
- When the user sends a message to a restored session, the backend connection is re-established and the conversation resumes seamlessly.
- Save errors are non-fatal — the session continues to work in memory even if disk writes fail.
- Corrupted or malformed save files are silently skipped during startup.

### 4.6 User Defaults

The application remembers the user's last-used working directory and backend choice. These are persisted to disk and restored on next launch. They pre-populate the folder picker when creating a new session.

### 4.7 Screen Wake Lock

The application requests a screen wake lock to prevent the device from sleeping during long-running AI operations. This is optional — if the browser doesn't support it, the application works normally without it.

---

## 5. Visual Design

### 5.1 Overall Aesthetic

The design uses a **retro terminal / warm monochrome** aesthetic with monospace typography throughout.

### 5.2 Theme System

Two themes, automatically selected based on the user's OS preference:

**Light theme:**
- Warm parchment background
- Dark earthy text
- Bronze/amber accent colors

**Dark theme:**
- Deep charcoal background
- Warm amber/phosphor text and accents
- CRT scanline texture overlay — subtle repeating horizontal lines at low opacity, giving a retro monitor feel

### 5.3 Typography

- Monospace font throughout the entire interface
- Base font size: 13px

### 5.4 Mobile Responsiveness

At narrow viewport widths (600px and below):
- Session delete buttons are always visible (not hover-dependent, since there is no hover on touch)
- Session info rows wrap naturally
- Reduced padding throughout
- Input textarea uses larger font size (16px) to prevent mobile browser zoom on focus
- Folder picker action buttons stack vertically instead of side-by-side

---

## 6. Navigation

Single-page application with hash-based routing:

| URL Hash | View |
|----------|------|
| `#/` or empty | Session list |
| `#/session/<id>` | Chat view for that session |

---

## 7. Real-Time Communication

The frontend and server communicate over a persistent real-time connection.

### 7.1 Connection Behavior

- The connection is established on page load.
- If the connection drops, the client automatically reconnects after a 1-second delay.
- On reconnect, the current view is re-initialized (session list is re-fetched, or the open session is re-subscribed).

### 7.2 Subscribing to Sessions

- When the user opens a session's chat view, the client subscribes to that session's event stream.
- While subscribed, the client receives all real-time streaming events from the AI.
- When the user navigates away (back to the list), the client unsubscribes.
- If a session is deleted by another client while the user is viewing it, the user is notified and navigated back to the list.

---

## 8. Session Lifecycle Summary

1. **Create** — User picks a directory and AI backend. Session is created instantly (backend not yet connected). User is navigated to the chat view.

2. **First message** — User sends a message. The backend connection is established for the first time. AI streams its response.

3. **Ongoing conversation** — User sends messages, AI responds. Responses stream in real time with tool invocations shown inline.

4. **Idle timeout** — After 5 minutes of inactivity, the backend connection is closed. The session remains in the list with all history preserved. The next message reconnects and resumes.

5. **Application restart** — All sessions are restored from disk in an inactive state. The next message re-establishes the backend connection and resumes the conversation.

6. **Deletion** — User deletes a session. The backend connection is closed, the saved data is removed, and the session disappears from the list. All other clients viewing that session are notified.

---

## 9. Security & Access Model

- **Local only** — the application is bound to localhost by default. Not designed to be exposed to a network.
- **No authentication** — since it is local-only, there is no login or user management.
- **XSS prevention** — all user-generated and AI-generated text is escaped before rendering in the browser.
- **No sensitive data** — no API keys, passwords, or tokens are handled by the application. The AI backends manage their own authentication independently.

---

## 10. Constraints & Limits

| Constraint | Value |
|------------|-------|
| Default idle timeout | 5 minutes |
| Max session title length | 80 characters |
| Max diff lines per file | 2,000 (truncated beyond) |
| Max untracked file size for diff | 50 KB (skipped beyond) |
| Auto-scroll proximity threshold | ~80 pixels from bottom |
| Input textarea max height | ~120 pixels |
| Reconnect delay | 1 second |
