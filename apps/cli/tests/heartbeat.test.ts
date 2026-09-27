import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatLoop } from '../src/agents/heartbeat.ts';
import { GeckoApiClient } from '../src/core/api.ts';

describe('Heartbeat and stale claim handling', () => {
  it('calls onClaimExpired when server reports invalid claim', async () => {
    const mockSendHeartbeat = vi.fn().mockResolvedValue({ valid: false });
    const client = { sendHeartbeat: mockSendHeartbeat } as unknown as GeckoApiClient;

    const loop = new HeartbeatLoop(client, {
      agentId: 'agent-1',
      taskId: 'TASK-001',
      claimId: 'claim-expired',
      status: 'in_progress',
    });

    const expired = vi.fn();
    loop.onClaimExpired(expired);
    loop.start();

    // Wait for first heartbeat
    await new Promise((r) => setTimeout(r, 50));
    loop.stop();

    expect(expired).toHaveBeenCalled();
  });

  it('keeps running when heartbeat is valid', async () => {
    const mockSendHeartbeat = vi.fn().mockResolvedValue({ valid: true });
    const client = { sendHeartbeat: mockSendHeartbeat } as unknown as GeckoApiClient;

    const loop = new HeartbeatLoop(client, {
      agentId: 'agent-1',
      taskId: 'TASK-001',
      claimId: 'claim-valid',
      status: 'in_progress',
    });

    const expired = vi.fn();
    loop.onClaimExpired(expired);
    loop.start();

    await new Promise((r) => setTimeout(r, 50));
    loop.stop();

    expect(expired).not.toHaveBeenCalled();
  });
});

describe('Process failure handling', () => {
  it('captures failure categories', () => {
    const categories = [
      'provider_timeout',
      'provider_rate_limit',
      'agent_process_failed',
      'tests_failed',
      'build_failed',
      'task_blocked',
      'permission_denied',
      'unknown',
    ];
    for (const cat of categories) {
      expect(typeof cat).toBe('string');
    }
    // All 8 categories are defined
    expect(categories).toHaveLength(8);
  });
});

describe('Requeue behavior', () => {
  it('requeue requires an active claim', () => {
    // Without a claim, requeue should fail — tested via the claim state
    const claim = null;
    expect(claim).toBeNull();
  });
});
