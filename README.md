# Meloetta

Local, browser-based session manager for AI coding assistants (Claude Code, Codex).

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and/or [Codex](https://github.com/openai/codex) CLI installed
- [Tailscale](https://tailscale.com/) (optional, for remote access from phone/tablet)

## Quick Start

```bash
bunx meloetta@latest
```

Or with npm:

```bash
npx meloetta@latest
```

Open [http://localhost:16480](http://localhost:16480) in your browser.

### CLI Options

```bash
bunx meloetta --host 0.0.0.0 --port 16480
```

| Flag     | Default     | Description                |
| -------- | ----------- | -------------------------- |
| `--host` | `127.0.0.1` | Address to bind            |
| `--port` | `16480`     | Port number (Pokedex #648) |

## Remote Access

To access Meloetta from your phone or tablet over Tailscale:

1. Install Tailscale on both your development machine and mobile device
2. Start Meloetta bound to all interfaces:
   ```bash
   bunx meloetta --host 0.0.0.0
   ```
3. Open `http://<tailscale-ip>:16480` on your mobile browser

## Development

```bash
git clone https://github.com/irvingdinh/meloetta.git
cd meloetta
bun install
cd web && bun install && cd ..
```

### Commands

| Command        | Description                                       |
| -------------- | ------------------------------------------------- |
| `make dev`     | Start Bun server + Vite dev server concurrently   |
| `make package` | Build frontend and prepare production artifact    |
| `make lint`    | Run ESLint + Prettier checks (backend + frontend) |
| `make test`    | Run backend tests                                 |
| `make clean`   | Remove `dist/` build output                       |
| `make publish` | Build and publish to npm                          |

### Development Workflow

`make dev` starts two processes:

- **Bun server** on `http://localhost:16480` (REST API + SSE)
- **Vite dev server** on `http://localhost:5173` (React frontend with HMR)

Open `http://localhost:5173` during development. Vite proxies `/api` requests to the Bun server.

### Production Build

```bash
make package
bun src/server/index.ts
```

The Bun server serves the built React frontend from `dist/web/` alongside the API.

## License

MIT
