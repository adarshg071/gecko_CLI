import { Command } from 'commander';
import path from 'path';
import { findProjectRoot, loadConfig } from '../core/config.js';
import { getDb, getClaim } from '../core/db.js';
import { runVerificationSuite } from '../verification/runner.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify <task_id>')
    .description('Run verification commands for a task in its worktree')
    .option('--json', 'Output results as JSON')
    .option('--timeout <ms>', 'Per-command timeout in ms', '120000')
    .action(async (taskId: string, opts: { json?: boolean; timeout: string }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const config = loadConfig(root);
      const db = getDb(path.join(root, '.gecko'));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}.\n`); process.exit(1); }

      const repoName = path.basename(root);
      const worktreePath = path.join(path.dirname(root), `${repoName}-gecko-${taskId}`);

      const commands = config.verification;
      if (commands.length === 0) { process.stdout.write('No verification commands configured in gecko.yml.\n'); return; }

      process.stdout.write(`Running ${commands.length} verification command(s) in ${worktreePath}...\n`);

      const results = await runVerificationSuite(commands, worktreePath, parseInt(opts.timeout, 10));

      if (opts.json) {
        process.stdout.write(JSON.stringify(results, null, 2) + '\n');
        return;
      }

      let allPassed = true;
      for (const r of results) {
        const icon = r.passed ? '✓' : '✗';
        const dur = `${r.duration_ms}ms`;
        process.stdout.write(`  ${icon} ${r.command} (${dur}${r.timed_out ? ' TIMEOUT' : ''})\n`);
        if (!r.passed && r.stderr) {
          process.stdout.write(`    ${r.stderr.split('\n').slice(0, 5).join('\n    ')}\n`);
        }
        if (!r.passed) allPassed = false;
      }

      // Send test result event (best-effort — broadcast to server)
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      await client.sendPrEvent({
        type: 'task.verification',
        task_id: taskId,
        claim_id: claim.claim_id,
        results,
        passed: allPassed,
      }).catch(() => { /* non-fatal */ });

      if (!allPassed) {
        process.stderr.write('\nVerification failed.\n');
        process.exit(1);
      }
      process.stdout.write('\n✓ All verification commands passed.\n');
    });
}
