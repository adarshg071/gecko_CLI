import { execa } from 'execa';
import { VerificationResult } from '../../../../packages/protocol/src/index.js';

const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  return s.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]';
}

export async function runVerificationCommand(
  command: string,
  cwd: string,
  timeoutMs = 120_000,
): Promise<VerificationResult> {
  const start = Date.now();
  let timed_out = false;

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => { timed_out = true; controller.abort(); }, timeoutMs);
    const result = await execa(command, {
      shell: true,
      cwd,
      all: true,
      cancelSignal: controller.signal,
      reject: false,
      forceKillAfterDelay: 1000,
    });
    clearTimeout(timer);
    timer = null;

    // When cancelled, isCanceled is true and exitCode may be null
    if ((result as unknown as { isCanceled?: boolean }).isCanceled) {
      timed_out = true;
    }

    return {
      command,
      exit_code: result.exitCode ?? 1,
      stdout: truncate(result.stdout ?? ''),
      stderr: truncate(result.stderr ?? ''),
      passed: !timed_out && (result.exitCode ?? 1) === 0,
      duration_ms: Date.now() - start,
      timed_out,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const cancelled = timed_out || (err instanceof Error && err.message.includes('cancel'));
    return {
      command,
      exit_code: 1,
      stdout: '',
      stderr: cancelled ? 'Command timed out' : String(err),
      passed: false,
      duration_ms: Date.now() - start,
      timed_out: cancelled,
    };
  }
}

export async function runVerificationSuite(
  commands: string[],
  cwd: string,
  timeoutMs = 120_000,
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const cmd of commands) {
    const result = await runVerificationCommand(cmd, cwd, timeoutMs);
    results.push(result);
    if (!result.passed) break; // Stop on first failure
  }
  return results;
}
