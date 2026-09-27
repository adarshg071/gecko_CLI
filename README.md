# Gecko CLI

Local execution client for Gecko — coordinates AI coding agents across developer machines.

The CLI runs IBM Bob (or any OpenAI-compatible model) on your laptop, manages Git worktrees per task, sends heartbeats to keep claims alive, and synchronises with the Gecko coordination server at [gecko-ashy.vercel.app](https://gecko-ashy.vercel.app).

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Connecting to the Server](#connecting-to-the-server)
- [Configuring a Provider](#configuring-a-provider)
- [Full Workflow](#full-workflow)
- [Command Reference](#command-reference)
- [Environment Variables](#environment-variables)
- [Security Notes](#security-notes)
- [Development](#development)

---

## Requirements

| Tool | Minimum version |
|------|----------------|
| Node.js | 22.5 or newer (Node 24 recommended) |
| npm | 9 or newer |
| Git | 2.5 or newer (worktree support) |

> **Why Node 22.5+?** The CLI uses the built-in `node:sqlite` module which shipped in Node 22.5. No native compilation is needed.

---

## Installation

### Option A — Clone and link (recommended for development)

```bash
git clone https://github.com/your-org/gecko.git
cd gecko

# Install all workspace dependencies
npm install

# Add gecko to your PATH (no sudo required)
mkdir -p ~/.local/bin
ln -sf "$(pwd)/apps/cli/bin/gecko.js" ~/.local/bin/gecko

# Make sure ~/.local/bin is on your PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Verify:

```bash
gecko --version
# 0.1.0
```

### Option B — Run directly without linking

If you prefer not to add anything to your PATH, prefix every command with the full path:

```bash
node /path/to/gecko/apps/cli/bin/gecko.js --help
```

Or use the npm script from inside `apps/cli/`:

```bash
cd apps/cli
npx tsx src/index.ts --help
```

---

## Quick Start

```bash
# 1. Go to your project repo
cd my-project

# 2. Initialize Gecko
gecko init

# 3. Sign in with GitHub
gecko connect

# 4. Configure your AI provider
gecko provider add

# 5. Generate a task plan
gecko plan generate
gecko plan review
gecko plan approve

# 6. Claim and run a task
gecko tasks
gecko claim TASK-001
gecko run TASK-001 -- bob
```

---

## Connecting to the Server

The Gecko server runs at **`https://gecko-ashy.vercel.app`** and uses **GitHub OAuth via Supabase**. There is no username/password — you sign in with your GitHub account.

```bash
gecko connect
```

What happens:

1. Your browser opens the GitHub OAuth page automatically.
2. You authorise the Gecko app on GitHub.
3. GitHub redirects to `localhost:9753/auth/callback/cli`.
4. The CLI captures the token from that local redirect.
5. Your credentials are saved to `~/.config/gecko/identity.json` with mode `0600`.

> **No browser?** (SSH, CI, headless) Copy the URL printed to the terminal and open it manually on any machine. The token is captured on `localhost:9753` so the machine running the CLI must be the same one whose browser handles the redirect.

### Using an existing token

If you already have a Supabase JWT from the web dashboard, you can skip the browser:

```bash
gecko connect --token eyJhbGciOiJIUzI1NiIs...
```

### Disconnecting

```bash
gecko disconnect
```

This removes `~/.config/gecko/identity.json`. The server-side session remains valid until the JWT expires.

---

## Configuring a Provider

Gecko supports any OpenAI-compatible API, plus IBM Bob.

```bash
gecko provider add
```

You will be prompted for:

```
Provider ID        →  a name you choose, e.g. my-openai
Provider type      →  openai-compatible | ibm-bob | mock
Base URL           →  https://api.openai.com
Model name         →  gpt-4o
API key            →  (masked input — NOT saved to disk)
Supports tool calls?  yes/no
Supports streaming?   yes/no
```

> **API keys are never stored in the database or sent to the server.** You must export the key as an environment variable before running the agent:

```bash
# For a provider with ID "my-openai":
export MY_OPENAI_API_KEY=sk-...

# For IBM Bob:
export IBM_BOB_API_KEY=...
export IBM_BOB_BASE_URL=https://your-bob-endpoint
export IBM_BOB_MODEL=your-model-name
```

Add these to your `.bashrc` / `.zshrc` or a local `.env` file (already in `.gitignore`).

### Listing and testing providers

```bash
gecko provider list
gecko provider test my-openai
```

---

## Full Workflow

```bash
# ── Setup (once per machine) ──────────────────────────────────────
git clone https://github.com/company/project.git
cd project

gecko init                      # creates gecko.yml, plan.md, .gecko/
gecko provider add              # configure IBM Bob or OpenAI
gecko connect                   # sign in with GitHub

# ── Planning ──────────────────────────────────────────────────────
# Edit plan.md to describe your project goal, then:
gecko plan generate             # calls your provider, writes .gecko/tasks/*.yml
gecko plan review               # inspect generated tasks
gecko plan approve              # upload to server

# ── Running a task ────────────────────────────────────────────────
gecko tasks                     # list available tasks
gecko claim TASK-001            # atomically claim (server enforces no double-claim)
gecko worktree TASK-001         # create ../project-gecko-TASK-001/ on a new branch
gecko reserve TASK-001 src/models/User.ts   # advisory file reservation

gecko run TASK-001 -- bob       # run IBM Bob in the worktree
                                # heartbeats every 15s keep the claim alive
                                # file watcher tracks changed files
                                # stops immediately if claim expires

# ── After the agent finishes ──────────────────────────────────────
gecko verify TASK-001           # run npm test / lint / build inside the worktree
gecko checkpoint TASK-001 "Created user model"
gecko pr TASK-001               # push branch, print GitHub PR URL

# ── Logs and status ───────────────────────────────────────────────
gecko status                    # show project + task states
gecko status --watch            # live-refresh every 10 seconds
gecko log pull                  # pull server events → GECKOLOG.jsonl
gecko log export                # write GECKOLOG.md (human-readable)
gecko logs TASK-001             # show cached events for one task
```

---

## Command Reference

### Initialization

| Command | Description |
|---------|-------------|
| `gecko init [--name NAME]` | Initialize Gecko in the current directory |
| `gecko connect [--token JWT]` | Sign in with GitHub and save credentials |
| `gecko disconnect` | Remove local credentials |

### Agent identity

| Command | Description |
|---------|-------------|
| `gecko agent status` | Show agent ID and connection info |
| `gecko agent register` | Re-register capabilities with the server |
| `gecko agent rename NAME` | Set a display name for this agent |

### Providers

| Command | Description |
|---------|-------------|
| `gecko provider add` | Interactively configure a new provider |
| `gecko provider list` | List configured providers |
| `gecko provider test ID` | Send a test request to a provider |
| `gecko provider remove ID` | Remove a provider |

### Planning

| Command | Description |
|---------|-------------|
| `gecko plan generate` | Generate tasks from `plan.md` using your provider |
| `gecko plan review` | Display draft tasks |
| `gecko plan approve` | Upload tasks to the server |

### Tasks

| Command | Description |
|---------|-------------|
| `gecko tasks` | List all tasks for the project |
| `gecko task show TASK_ID` | Show full task details |
| `gecko task add TITLE` | Create a new task |
| `gecko claim TASK_ID` | Atomically claim a task |
| `gecko release TASK_ID` | Release your claim |
| `gecko requeue TASK_ID` | Make a task available to other agents |

### Runtime

| Command | Description |
|---------|-------------|
| `gecko worktree TASK_ID` | Create a Git worktree + branch for a task |
| `gecko worktree list` | List all worktrees |
| `gecko worktree remove TASK_ID` | Remove a task worktree |
| `gecko run TASK_ID -- CMD` | Run an agent command in the worktree |
| `gecko verify TASK_ID` | Run verification commands from `gecko.yml` |
| `gecko reserve TASK_ID PATH...` | Declare files this task will modify |
| `gecko checkpoint TASK_ID MSG` | Record a progress checkpoint |
| `gecko handoff TASK_ID` | Generate a handoff summary |
| `gecko resume TASK_ID` | Resume a task from its last handoff |

### Status and logs

| Command | Description |
|---------|-------------|
| `gecko status [--watch]` | Show project status (live with `--watch`) |
| `gecko logs TASK_ID` | Show cached events for a task |
| `gecko log pull` | Pull server events, write `GECKOLOG.jsonl` |
| `gecko log export` | Write human-readable `GECKOLOG.md` |

### Pull requests

| Command | Description |
|---------|-------------|
| `gecko pr TASK_ID` | Commit, push branch, print GitHub PR URL |

---

## Environment Variables

Create a `.env` file in your project root (it is already `.gitignore`d by `gecko init`):

```env
# Gecko server (default is already set — only override for self-hosting)
GECKO_API_URL=https://gecko-ashy.vercel.app

# IBM Bob provider
IBM_BOB_API_KEY=your-api-key
IBM_BOB_BASE_URL=https://your-bob-endpoint
IBM_BOB_MODEL=your-model-name

# OpenAI-compatible provider (key name matches your provider ID)
# Replace MY_OPENAI with your provider ID in uppercase with dashes as underscores
MY_OPENAI_API_KEY=sk-...
```

> **Never commit API keys.** The `.env` file and `~/.config/gecko/identity.json` are the only places credentials are stored.

---

## Security Notes

- Provider API keys are **never** written to the SQLite cache or sent to the Gecko server
- The device token is stored at `~/.config/gecko/identity.json` with file mode `0600`
- Verification commands run **only inside the assigned Git worktree** — never in your main repo
- The CLI stops immediately if the server reports that a claim has expired
- `gecko pr` never auto-merges — a human must review and merge
- Command output is capped at 64 KB to prevent log flooding
- All verification commands have a configurable timeout (default 120 s)

---

## Development

### Running tests

```bash
cd apps/cli
npx vitest run          # run all 36 tests
npx vitest              # watch mode
```

### Project structure

```
gecko/
├── apps/cli/
│   ├── bin/gecko.js          ← executable entry point
│   ├── src/
│   │   ├── commands/         ← one file per CLI command
│   │   ├── core/             ← config, identity, db, api client
│   │   ├── providers/        ← OpenAI adapter, IBM Bob adapter, mock
│   │   ├── git/              ← worktree management
│   │   ├── agents/           ← heartbeat loop
│   │   ├── sync/             ← event pull + GECKOLOG materialization
│   │   └── verification/     ← command runner with timeout
│   └── tests/                ← Vitest test suite
└── packages/protocol/
    └── src/index.ts          ← Zod schemas shared across the monorepo
```

### Local files created by `gecko init`

```
gecko.yml          ← project config (commit this)
plan.md            ← project goal for the planner (commit this)
.gecko/
  tasks/           ← draft task YAML files (commit these)
  cache.db         ← local SQLite event cache (gitignored)
  events/local/    ← local event scratch (gitignored)
  worktrees/       ← symlinks to active worktrees (gitignored)
GECKOLOG.jsonl     ← pulled event audit log (commit this)
GECKOLOG.md        ← human-readable export (commit this)
```
