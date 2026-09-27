# Gecko CLI Build Specification

## Instructions To The Bob IDE Agent

You are building the local execution client for Gecko.

Implement the CLI, local agent runtime, Git worktree management, IBM Bob provider adapter, event synchronization, and verification workflow described in this file. Do not build the web dashboard or duplicate the web database.

The Gecko web developer is implementing the coordination API. The API and event contracts in this file must remain compatible with `GECKO_WEB_BUILD.md`.

## Product Definition

Gecko coordinates AI coding agents running on different developer laptops.

The CLI is responsible for:

- Local project initialization
- Connecting a laptop to a Gecko project
- Registering an agent identity
- Configuring any supported model provider
- Running IBM Bob or another agent locally
- Creating Git branches and worktrees
- Running tests and builds
- Watching changed files
- Sending heartbeats and checkpoints
- Pulling the central event log
- Materializing `GECKOLOG.jsonl`
- Opening pull requests

The CLI is not the source of truth for task ownership. The Gecko web API and database own claims, leases, file reservations, and event ordering.

## Required Stack

- TypeScript
- Node.js 20 or newer
- Commander or similar CLI parser
- SQLite for local cache and offline metadata
- Zod for protocol validation
- Native Git commands through `child_process`
- Chokidar or equivalent file watcher
- Vitest for tests
- Execa or equivalent safe process runner
- Octokit only when local GitHub operations need API support

Do not use Python for the MVP. Do not build a web server inside the CLI.

## Repository Structure

Create or preserve this structure:

```text
apps/cli/
  src/
    commands/
    core/
    git/
    agents/
    providers/
    sync/
    verification/
    logging/
    ui/
  tests/
packages/protocol/
  src/
```

## Local Files

`gecko init` creates:

```text
gecko.yml
plan.md
.gecko/
  tasks/
  cache.db
  events/
  worktrees/
```

Add these to `.gitignore`:

```text
.gecko/cache.db
.gecko/events/local/
.gecko/worktrees/
```

The following files may be committed:

```text
gecko.yml
plan.md
.gecko/tasks/
GECKOLOG.jsonl
GECKOLOG.md
```

The local log files are audit exports. They are not used as the authority for task claiming.

## Environment Variables

Create `.env.example`:

```text
GECKO_API_URL=https://api.gecko.dev
GECKO_PROJECT_ID=
GECKO_DEVICE_TOKEN=
IBM_BOB_API_KEY=
IBM_BOB_BASE_URL=
IBM_BOB_MODEL=
```

The IBM Bob key must never be written to the repository or sent to the Gecko website. Store it using an environment variable or the operating system keychain.

## Provider Configuration

Implement provider configuration through:

```bash
gecko provider add
gecko provider list
gecko provider remove PROVIDER_ID
gecko provider test PROVIDER_ID
```

Prompt for:

```text
Provider ID
Provider type
Base URL
Model name
API key
Supports tool calls?
Supports streaming?
```

Use a provider adapter interface:

```typescript
interface AgentProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(input: AgentInput): Promise<AgentOutput>;
  stream?(input: AgentInput): AsyncIterable<AgentEvent>;
}
```

Implement an OpenAI-compatible HTTP adapter first. Add a separate IBM Bob adapter only when the exact Bob API request and response schema is known.

The adapter must fail with a clear message if `IBM_BOB_BASE_URL`, `IBM_BOB_MODEL`, or `IBM_BOB_API_KEY` is missing.

## Agent Identity

`gecko connect` registers the laptop with the hosted Gecko API.

```bash
gecko connect
```

The command must:

1. Read `gecko.yml`.
2. Request a device code from the API.
3. Display a browser URL and one-time code.
4. Poll until the user approves the device.
5. Receive a project-scoped token.
6. Receive a stable agent ID.
7. Store credentials outside the repository.
8. Register provider capabilities.
9. Start a heartbeat loop.

The user may set a display name:

```bash
gecko agent rename frontend-bob
```

Store identity at:

```text
~/.config/gecko/identity.json
```

Use restrictive file permissions. Never use hardware fingerprints as identity.

## CLI Commands

Implement these commands:

```bash
gecko init
gecko connect
gecko disconnect
gecko agent register
gecko agent status
gecko agent rename NAME
gecko provider add
gecko provider list
gecko provider test PROVIDER_ID
gecko plan generate
gecko plan review
gecko plan approve
gecko tasks
gecko task show TASK_ID
gecko task add TITLE
gecko claim TASK_ID
gecko release TASK_ID
gecko requeue TASK_ID
gecko worktree TASK_ID
gecko worktree list
gecko worktree remove TASK_ID
gecko run TASK_ID -- bob
gecko checkpoint TASK_ID MESSAGE
gecko reserve TASK_ID PATH...
gecko verify TASK_ID
gecko status
gecko status --watch
gecko logs TASK_ID
gecko log pull
gecko log export
gecko pr TASK_ID
```

Every command must have:

- Human-readable output
- `--json` output where practical
- Non-zero exit code on failure
- Clear error messages
- No credential leakage

## Plan Generation

Implement:

```bash
gecko plan generate
```

The command reads:

- `plan.md`
- `gecko.yml`
- Repository tree
- Package files
- Test files
- README files
- Existing task files
- Relevant Git history

It sends a structured planning request through the configured provider.

Require a JSON response matching this shape:

```json
{
  "goal": "Add authentication",
  "tasks": [
    {
      "display_id": "TASK-001",
      "title": "Create user model",
      "description": "...",
      "acceptance_criteria": ["..."],
      "expected_files": ["src/models/User.ts"],
      "verification_commands": ["npm test"],
      "depends_on": [],
      "risk": "medium"
    }
  ]
}
```

Validate the response with Zod. Reject malformed plans. Never automatically approve generated plans.

Write draft tasks to:

```text
.gecko/tasks/TASK-001.yml
```

`gecko plan approve` sends the draft plan to the Gecko API and pushes the approved task definitions to Git.

## Task Claims

`gecko claim TASK-001` calls the central API. It must never claim by editing a local task file.

Request:

```json
{
  "project_id": "project-123",
  "task_id": "TASK-001",
  "agent_id": "agent-abc",
  "attempt_number": 1,
  "lease_seconds": 300,
  "idempotency_key": "uuid"
}
```

Success:

```json
{
  "success": true,
  "claim_id": "claim-123",
  "lease_expires_at": "2026-09-26T12:30:00Z"
}
```

Conflict:

```json
{
  "success": false,
  "reason": "already_claimed",
  "owner_agent_id": "agent-other"
}
```

The CLI must cache the active `claim_id` and include it with every task action.

## Heartbeats and Leases

Send a heartbeat every 15 seconds while a task is active:

```text
POST /api/agents/:id/heartbeat
```

Include:

- Agent ID
- Task ID
- Claim ID
- Current status
- Current command
- Current branch
- Changed files
- Process ID

If the server rejects a heartbeat because the claim expired, stop the agent and display:

```text
This task is no longer owned by this agent. Stop editing and preserve the worktree.
```

Do not allow stale agents to mark tasks complete.

## Event Synchronization

The server is the source of truth for events. The CLI stores only a local cache.

Track the last received project sequence:

```text
last_event_sequence = 103
```

Pull:

```http
GET /api/projects/:id/events?after_sequence=103
```

Apply events idempotently. If the same event is received twice, do not duplicate it.

Persist local events in:

```text
.gecko/cache.db
```

Materialize the repository audit copy with:

```bash
gecko log pull
```

The command writes:

```text
GECKOLOG.jsonl
```

`gecko log export` also writes a readable:

```text
GECKOLOG.md
```

Agents must not use `GECKOLOG` to decide whether a task is available. They must call the claim API.

## Task State Machine

Support these states:

```text
draft
ready
claimed
in_progress
testing
blocked
failed
stale
requeued
review
completed
cancelled
```

Valid flow:

```text
draft -> ready
ready -> claimed
claimed -> in_progress
in_progress -> testing
testing -> review
testing -> failed
claimed -> stale
stale -> requeued
requeued -> claimed
review -> completed
any state -> cancelled
```

## Failure Handling

When an agent fails:

1. Capture exit code.
2. Capture stderr and stdout.
3. Capture the last checkpoint.
4. Capture changed files.
5. Capture test results.
6. Send a `task.failed` event.
7. Keep the worktree.
8. Keep the branch.
9. Keep the claim until the server decides whether it is stale or released.

Failure categories:

```text
provider_timeout
provider_rate_limit
agent_process_failed
tests_failed
build_failed
task_blocked
permission_denied
unknown
```

Do not automatically requeue every failure. A test failure may require the current agent to fix the task. A provider timeout may be retried. A crash may become stale after the lease expires.

## Worktrees and Git

After a successful claim:

```bash
gecko worktree TASK-001
```

Create:

```text
../project-gecko-TASK-001/
```

With branch:

```text
gecko/AGENT_ID/TASK-001-attempt-1
```

Implement:

- Worktree creation
- Branch existence checks
- Dirty working-tree checks
- Branch push
- Worktree cleanup after merge
- Preservation of failed worktrees
- Detection of wrong branch
- Task-to-branch linkage

## File Reservations

Before editing, send expected files:

```bash
gecko reserve TASK-001 src/models/User.ts tests/user.test.ts
```

The API decides whether the reservation is accepted or returns a warning.

Reservations are advisory in the MVP. Git remains responsible for final merge conflicts.

## Agent Runner

Implement:

```bash
gecko run TASK-001 -- bob
```

The runner must:

1. Confirm the task is claimed by this agent.
2. Create or open the task worktree.
3. Load task context.
4. Load repository rules.
5. Start the configured provider.
6. Capture process output.
7. Watch file changes.
8. Send heartbeats.
9. Send checkpoints.
10. Run verification commands.
11. Submit success or failure.
12. Leave the worktree available for review.

Design the runner around an adapter interface so IBM Bob is not hardcoded into every command.

## IBM Bob Provider

Implement a generic provider adapter using:

```text
IBM_BOB_API_KEY
IBM_BOB_BASE_URL
IBM_BOB_MODEL
```

Do not guess an IBM Bob endpoint if its API documentation is unavailable. Isolate the HTTP request code in one file and provide a mock provider for tests.

The provider must support, where the Bob API allows it:

- Structured JSON planning
- Streaming output
- Tool calls
- Context input
- Error classification
- Retryable errors

If Bob does not support tool calls, implement a structured patch or command response mode and fail clearly when a task requires unsupported capabilities.

## Verification

Read commands from `gecko.yml` and the task definition:

```yaml
verification:
  - npm test
  - npm run lint
  - npm run build
```

Implement:

- Command execution
- Timeout
- Exit-code handling
- Output capture
- Test result event
- Redacted output
- Maximum output size
- Cancellation

Never execute verification commands outside the assigned worktree.

## Checkpoints and Handoffs

Implement:

```bash
gecko checkpoint TASK-001 "Created user model"
gecko handoff TASK-001
gecko resume TASK-001
```

A handoff must include:

- Completed work
- Incomplete work
- Current assumptions
- Failing commands
- Changed files
- Suggested next step
- Current claim and attempt number

## Pull Requests

Implement:

```bash
gecko pr TASK-001
```

The command must:

- Confirm verification passed or ask for confirmation.
- Confirm the active claim is still valid.
- Commit changes if needed.
- Push the branch.
- Open or update a pull request.
- Include task ID.
- Include agent ID.
- Include verification results.
- Include changed files.
- Send a `pull_request.created` event.

The CLI must never merge automatically in the MVP.

## CLI Tasks

### Foundation

- [ ] Create Node.js TypeScript CLI.
- [ ] Configure strict TypeScript.
- [ ] Add command parser.
- [ ] Add Zod protocol schemas.
- [ ] Add SQLite cache.
- [ ] Add `.env.example`.
- [ ] Add Vitest.
- [ ] Add temporary Git repository test fixture.

### Initialization and Connection

- [ ] Implement `gecko init`.
- [ ] Generate `gecko.yml`.
- [ ] Generate `plan.md` template.
- [ ] Implement device-code connection flow.
- [ ] Store project-scoped credentials securely.
- [ ] Register stable agent ID.
- [ ] Implement disconnect and credential revocation.

### Provider System

- [ ] Implement provider configuration.
- [ ] Implement provider listing.
- [ ] Implement provider testing.
- [ ] Implement OpenAI-compatible adapter.
- [ ] Isolate IBM Bob adapter.
- [ ] Add mock provider for tests.
- [ ] Add provider capability detection.
- [ ] Redact provider credentials from logs.

### Planning

- [ ] Read `plan.md`.
- [ ] Scan repository metadata.
- [ ] Build planner context.
- [ ] Call provider for structured task plan.
- [ ] Validate task plan.
- [ ] Write draft task files.
- [ ] Upload draft plan to API.
- [ ] Implement plan review.
- [ ] Implement plan approval.

### Agent and Tasks

- [ ] Implement agent registration.
- [ ] Implement task listing.
- [ ] Implement task detail.
- [ ] Implement atomic task claim request.
- [ ] Implement claim conflict handling.
- [ ] Implement release.
- [ ] Implement requeue request.
- [ ] Implement dependency display.
- [ ] Implement task checkpoints.

### Runtime

- [ ] Implement Git worktrees.
- [ ] Implement task branches.
- [ ] Implement provider runner.
- [ ] Implement process output capture.
- [ ] Implement file watcher.
- [ ] Implement heartbeats.
- [ ] Implement task cancellation.
- [ ] Implement verification commands.
- [ ] Implement handoff generation.

### Synchronization

- [ ] Implement event cursor.
- [ ] Implement incremental event pulling.
- [ ] Implement idempotent event application.
- [ ] Implement local cache recovery.
- [ ] Implement `gecko log pull`.
- [ ] Implement `gecko log export`.
- [ ] Implement `gecko status --watch`.

### Pull Requests

- [ ] Implement branch push.
- [ ] Implement GitHub authentication check.
- [ ] Implement pull request creation.
- [ ] Include verification evidence.
- [ ] Include task and agent metadata.
- [ ] Preserve failed branches.

### Tests

- [ ] Test provider configuration.
- [ ] Test malformed planner output.
- [ ] Test device pairing.
- [ ] Test task claim success.
- [ ] Test task claim conflict.
- [ ] Test stale claim rejection.
- [ ] Test duplicate event handling.
- [ ] Test worktree creation.
- [ ] Test process failure.
- [ ] Test verification timeout.
- [ ] Test requeue behavior.
- [ ] Test pull request creation with a mock GitHub API.
- [ ] Test two CLI processes racing for one task.

## CLI Acceptance Criteria

The CLI is complete when:

1. A user can run `gecko init`.
2. A user can connect to a Gecko project.
3. The CLI receives a stable agent ID.
4. The CLI can configure any supported provider without committing credentials.
5. IBM Bob can generate a structured task plan through the adapter.
6. A plan can be submitted for human approval.
7. An agent can list available tasks.
8. Two agents cannot claim the same task.
9. A claimed task gets a separate worktree.
10. Heartbeats keep the claim alive.
11. Stale claims are rejected after expiration.
12. A failed task preserves logs and worktree state.
13. A requeued task becomes available to other agents.
14. Events synchronize incrementally.
15. `GECKOLOG.jsonl` can be pulled and exported.
16. Tests run inside the task worktree.
17. A pull request can be created with verification evidence.

## Security Requirements

- Never commit provider keys.
- Never print provider keys.
- Never send provider keys to the web API.
- Never execute commands outside the task worktree.
- Require an active claim for task writes.
- Stop when a claim expires.
- Redact secrets from logs.
- Limit command output size.
- Apply command timeouts.
- Require explicit confirmation for destructive commands.
- Preserve failed worktrees for inspection.
- Never automatically merge pull requests.

## Final Local Workflow

```bash
git clone https://github.com/company/project.git
cd project

gecko init
gecko provider add
gecko connect
gecko plan generate
gecko plan review
gecko plan approve
gecko tasks
gecko claim TASK-001
gecko run TASK-001 -- bob
gecko status --watch
gecko verify TASK-001
gecko pr TASK-001
gecko log pull
```

The CLI is the local execution layer. The Gecko web service is the authoritative coordination layer. GitHub stores the code, and `GECKOLOG` is the synchronized audit trail.
