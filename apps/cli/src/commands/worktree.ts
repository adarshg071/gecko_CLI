import { Command } from 'commander';
import path from 'path';
import { findProjectRoot, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { getDb, getClaim } from '../core/db.js';
import {
  createWorktree,
  listWorktrees,
  removeWorktree,
} from '../git/worktree.js';

export function registerWorktreeCommand(program: Command): void {
  const wt = program.command('worktree').description('Manage Git worktrees for tasks');

  // gecko worktree create TASK-001   (also the default when called as `gecko worktree TASK-001`)
  wt
    .command('create <task_id>', { isDefault: true })
    .description('Create a Git worktree for a task')
    .action(async (taskId: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const identity = loadIdentity();
      const db = getDb(getGeckoDir(root));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}. Run: gecko claim ${taskId}\n`); process.exit(1); }

      const { worktreePath, branch } = await createWorktree({
        repoRoot: root,
        taskId,
        agentId: identity.agent_id,
        attemptNumber: claim.attempt_number,
      });

      process.stdout.write(`✓ Worktree ready\n`);
      process.stdout.write(`  Path:   ${worktreePath}\n`);
      process.stdout.write(`  Branch: ${branch}\n`);
    });

  wt
    .command('list')
    .description('List all task worktrees')
    .action(async () => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const trees = await listWorktrees(root);
      if (trees.length <= 1) { process.stdout.write('No task worktrees.\n'); return; }
      for (const t of trees.slice(1)) {
        process.stdout.write(`  ${t.branch.padEnd(50)} ${t.path}\n`);
      }
    });

  wt
    .command('remove <task_id>')
    .description('Remove a task worktree')
    .action(async (taskId: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const repoName = path.basename(root);
      const worktreePath = path.join(path.dirname(root), `${repoName}-gecko-${taskId}`);
      await removeWorktree(root, worktreePath);
      process.stdout.write(`✓ Worktree removed: ${worktreePath}\n`);
    });

  // Also keep `gecko worktrees` as a top-level alias
  program
    .command('worktrees')
    .description('List all task worktrees (alias for gecko worktree list)')
    .action(async () => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const trees = await listWorktrees(root);
      if (trees.length <= 1) { process.stdout.write('No task worktrees.\n'); return; }
      for (const t of trees.slice(1)) {
        process.stdout.write(`  ${t.branch.padEnd(50)} ${t.path}\n`);
      }
    });
}
