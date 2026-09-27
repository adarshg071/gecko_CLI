import { GeckoApiClient } from '../core/api.js';
import { HeartbeatPayload, TaskState } from '../../../../packages/protocol/src/index.js';

const HEARTBEAT_INTERVAL_MS = 15_000;

export interface HeartbeatContext {
  agentId: string;
  taskId: string;
  claimId: string;
  status: TaskState;
  currentCommand?: string;
  currentBranch?: string;
  changedFiles?: string[];
  pid?: number;
}

export class HeartbeatLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private onExpired: (() => void) | null = null;
  private context: HeartbeatContext;
  private readonly client: GeckoApiClient;

  constructor(client: GeckoApiClient, context: HeartbeatContext) {
    this.client = client;
    this.context = context;
  }

  updateContext(partial: Partial<HeartbeatContext>): void {
    this.context = { ...this.context, ...partial };
  }

  onClaimExpired(cb: () => void): void {
    this.onExpired = cb;
  }

  start(): void {
    if (this.timer) return;
    void this.send();
    this.timer = setInterval(() => { void this.send(); }, HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async send(): Promise<void> {
    try {
      const payload: HeartbeatPayload = {
        agent_id: this.context.agentId,
        task_id: this.context.taskId,
        claim_id: this.context.claimId,
        status: this.context.status,
        current_command: this.context.currentCommand,
        current_branch: this.context.currentBranch,
        changed_files: this.context.changedFiles,
        process_id: this.context.pid,
      };
      const result = await this.client.sendHeartbeat(this.context.agentId, payload);
      if (!result.valid) {
        process.stderr.write(
          'This task is no longer owned by this agent. Stop editing and preserve the worktree.\n'
        );
        this.stop();
        this.onExpired?.();
      }
    } catch {
      // Transient network errors — keep trying
    }
  }
}
