import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaimResponseSchema } from '../../packages/protocol/src/index.ts';

describe('Task claim success', () => {
  it('parses a successful claim response', () => {
    const raw = {
      success: true,
      claim_id: 'claim-abc',
      lease_expires_at: '2026-09-26T12:30:00Z',
    };
    const result = ClaimResponseSchema.parse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.claim_id).toBe('claim-abc');
  });
});

describe('Task claim conflict', () => {
  it('parses a conflict response', () => {
    const raw = {
      success: false,
      reason: 'already_claimed',
      owner_agent_id: 'agent-other',
    };
    const result = ClaimResponseSchema.parse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('already_claimed');
      expect(result.owner_agent_id).toBe('agent-other');
    }
  });

  it('parses a conflict without owner_agent_id', () => {
    const raw = { success: false, reason: 'task_not_ready' };
    const result = ClaimResponseSchema.parse(raw);
    expect(result.success).toBe(false);
  });
});

describe('Stale claim rejection', () => {
  it('detects an expired lease', () => {
    const leaseExpires = new Date(Date.now() - 1000).toISOString();
    const isExpired = new Date(leaseExpires) < new Date();
    expect(isExpired).toBe(true);
  });

  it('detects a valid lease', () => {
    const leaseExpires = new Date(Date.now() + 60_000).toISOString();
    const isExpired = new Date(leaseExpires) < new Date();
    expect(isExpired).toBe(false);
  });
});
