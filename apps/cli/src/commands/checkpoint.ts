import { Command } from 'commander';
import { findProjectRoot, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getClaim } from '../core/db.js';
import { changedFiles } from '../git/worktree.js';
import path from 'path';

export function registerCheckpointCommand(program: Command): void {
  program
    .command('checkpoint <task_id> <message>')
    .description('Record a checkpoint for the current task state')
    .action(async (taskId: string, message: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}.\n`); process.exit(1); }

      const repoName = path.basename(root);
      const worktreePath = path.join(path.dirname(root), `${repoName}-gecko-${taskId}`);
      const files = await changedFiles(worktreePath).catch(() => []);

      await client.sendCheckpoint({
        task_id: taskId,
        claim_id: claim.claim_id,
        message,
        changed_files: files,
        timestamp: new Date().toISOString(),
      });
      process.stdout.write(`✓ Checkpoint recorded: ${message}\n`);
    });

  // Handoff
  program
    .command('handoff <task_id>')
    .description('Generate a handoff summary for the current task')
    .action(async (taskId: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}.\n`); process.exit(1); }

      const repoName = path.basename(root);
      const worktreePath = path.join(path.dirname(root), `${repoName}-gecko-${taskId}`);
      const files = await changedFiles(worktreePath).catch(() => []);

      const handoff = {
        task_id: taskId,
        claim_id: claim.claim_id,
        attempt_number: claim.attempt_number,
        completed_work: '',
        incomplete_work: '',
        current_assumptions: '',
        failing_commands: [] as string[],
        changed_files: files,
        suggested_next_step: '',
        timestamp: new Date().toISOString(),
      };

      await client.sendCheckpoint({ type: 'handoff', ...handoff });
      process.stdout.write(`✓ Handoff recorded for ${taskId}.\n`);
    });

  program
    .command('resume <task_id>')
    .description('Resume a task from the last handoff')
    .action((taskId: string) => {
      process.stdout.write(`Resuming ${taskId}. Run: gecko run ${taskId} -- bob\n`);
    });
}
