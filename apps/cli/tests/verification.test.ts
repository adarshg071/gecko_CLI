import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runVerificationCommand, runVerificationSuite } from '../src/verification/runner.ts';

describe('Verification runner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gecko-verify-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('captures passing command', async () => {
    const result = await runVerificationCommand('echo "ok"', tmpDir);
    expect(result.passed).toBe(true);
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain('ok');
  });

  it('captures failing command', async () => {
    const result = await runVerificationCommand('exit 1', tmpDir);
    expect(result.passed).toBe(false);
    expect(result.exit_code).not.toBe(0);
  });

  it('times out long-running commands', async () => {
    const result = await runVerificationCommand('sleep 5', tmpDir, 300);
    expect(result.timed_out).toBe(true);
    expect(result.passed).toBe(false);
  }, 10_000);

  it('stops suite on first failure', async () => {
    const results = await runVerificationSuite(
      ['exit 1', 'echo "should not run"'],
      tmpDir,
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
  });

  it('captures stdout within size limit', async () => {
    const result = await runVerificationCommand('echo "hello world"', tmpDir);
    expect(result.stdout.length).toBeLessThanOrEqual(64 * 1024 + 20);
  });
});
