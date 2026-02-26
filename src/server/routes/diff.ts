import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { Rotom } from "../../session-manager.js";

interface DiffLine {
  type: "context" | "addition" | "deletion" | "hunk_header";
  content: string;
  oldNum?: number;
  newNum?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked" | "binary";
  hunks: DiffHunk[];
  truncated?: boolean;
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const result =
      await Bun.$`git -C ${cwd} rev-parse --is-inside-work-tree`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileSections = text.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split("\n");
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const path = headerMatch[2]!;
    let status: DiffFile["status"] = "modified";

    if (section.includes("Binary files")) {
      files.push({ path, status: "binary", hunks: [] });
      continue;
    }

    if (section.includes("new file mode")) status = "added";
    else if (section.includes("deleted file mode")) status = "deleted";
    else if (section.includes("rename from")) status = "renamed";

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldNum = 0;
    let newNum = 0;
    let lineCount = 0;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (m) {
          oldNum = parseInt(m[1]!);
          newNum = parseInt(m[2]!);
          currentHunk = { header: line, lines: [] };
          hunks.push(currentHunk);
        }
      } else if (currentHunk) {
        if (lineCount >= 2000) continue;
        if (line.startsWith("+")) {
          currentHunk.lines.push({
            type: "addition",
            content: line.slice(1),
            newNum: newNum++,
          });
          lineCount++;
        } else if (line.startsWith("-")) {
          currentHunk.lines.push({
            type: "deletion",
            content: line.slice(1),
            oldNum: oldNum++,
          });
          lineCount++;
        } else if (line.startsWith(" ")) {
          currentHunk.lines.push({
            type: "context",
            content: line.slice(1),
            oldNum: oldNum++,
            newNum: newNum++,
          });
          lineCount++;
        }
      }
    }

    files.push({ path, status, hunks, truncated: lineCount >= 2000 });
  }

  return files;
}

async function getGitDiff(cwd: string): Promise<{
  files: DiffFile[];
  stats: { files: number; additions: number; deletions: number };
}> {
  let diffText = "";
  try {
    const result = await Bun.$`git -C ${cwd} diff HEAD`.quiet();
    diffText = result.text();
  } catch {
    try {
      const result = await Bun.$`git -C ${cwd} diff --cached`.quiet();
      diffText = result.text();
    } catch {
      // no diff available
    }
  }

  const files = parseUnifiedDiff(diffText);

  try {
    const untrackedResult =
      await Bun.$`git -C ${cwd} ls-files --others --exclude-standard`.quiet();
    const untrackedPaths = untrackedResult
      .text()
      .trim()
      .split("\n")
      .filter(Boolean);

    for (const filePath of untrackedPaths) {
      const fullPath = join(cwd, filePath);
      try {
        const s = await stat(fullPath);
        if (s.size > 50 * 1024) {
          files.push({
            path: filePath,
            status: "untracked",
            hunks: [],
            truncated: true,
          });
          continue;
        }
        const content = await readFile(fullPath, "utf-8");
        const contentLines = content.split("\n");
        const lines: DiffLine[] = [];
        const limit = Math.min(contentLines.length, 2000);
        for (let i = 0; i < limit; i++) {
          lines.push({
            type: "addition",
            content: contentLines[i]!,
            newNum: i + 1,
          });
        }
        files.push({
          path: filePath,
          status: "untracked",
          hunks: lines.length
            ? [{ header: `@@ -0,0 +1,${limit} @@ new file`, lines }]
            : [],
          truncated: contentLines.length > 2000,
        });
      } catch {
        files.push({ path: filePath, status: "untracked", hunks: [] });
      }
    }
  } catch {
    // no untracked files
  }

  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "addition") additions++;
        else if (line.type === "deletion") deletions++;
      }
    }
  }

  return { files, stats: { files: files.length, additions, deletions } };
}

interface Ctx {
  rotom: Rotom;
}

export async function handleGetDiff(
  _req: Request,
  ctx: Ctx,
  params: { id: string },
): Promise<Response> {
  const session = ctx.rotom.get(params.id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  const result = await getGitDiff(session.cwd);
  return Response.json(result);
}
