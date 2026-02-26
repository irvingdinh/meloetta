# CLAUDE.md

## Rules

1. **Local reference convention** — When referencing external dependency source code, clone the repository into `.idea/github.com/{owner}/{repo}` and read from there. Use Explore subagents to navigate local clones. Prefer local source over web search for accuracy and up-to-date information.

2. **Always use `bun`** — Use `bun` for all JavaScript/TypeScript operations instead of `node`, `npm`, or `npx`. This includes running scripts (`bun run`), installing packages (`bun add`), executing tests (`bun test`), and running files (`bun src/server/index.ts`).
