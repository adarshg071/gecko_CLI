import { describe, it, expect, vi } from 'vitest';
import { GeckoApiClient } from '../src/core/api.ts';
import { ClaimResponseSchema } from '../../packages/protocol/src/index.ts';
import { v4 as uuid } from 'uuid';

/**
 * Simulates two agents racing for the same task by calling the claim API.
 * Uses mocked HTTP to test the conflict path.
 */
describe('Two agents racing for one task', () => {
  it('first agent gets the claim, second gets conflict', async () => {
    // Mock fetch: first call succeeds, second call conflicts
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            claim_id: 'claim-winner',
            lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          success: false,
          reason: 'already_claimed',
          owner_agent_id: 'agent-1',
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    const client = new GeckoApiClient({ apiUrl: 'https://gecko-ashy.vercel.app', token: 'tok' });

    const body = {
      project_id: 'proj-1',
      task_id: 'TASK-001',
      agent_id: 'agent-1',
      attempt_number: 1,
      lease_seconds: 300,
      idempotency_key: uuid(),
    };

    const raw1 = await client.claimTask(body);
    const result1 = ClaimResponseSchema.parse(raw1);
    expect(result1.success).toBe(true);

    const raw2 = await client.claimTask({ ...body, agent_id: 'agent-2', idempotency_key: uuid() });
    const result2 = ClaimResponseSchema.parse(raw2);
    expect(result2.success).toBe(false);
    if (!result2.success) expect(result2.reason).toBe('already_claimed');

    vi.unstubAllGlobals();
  });
});
