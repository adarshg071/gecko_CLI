import { Command } from 'commander';
import path from 'path';
import inquirer from 'inquirer';
import { findProjectRoot, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getClaim } from '../core/db.js';
import { commitAll, pushBranch, currentBranch, getRepoRemote, changedFiles } from '../git/worktree.js';
import { runVerificationSuite } from '../verification/runner.js';
import { loadConfig } from '../core/config.js';

export function registerPrCommand(program: Command): void {
  program
    .command('pr <task_id>')
    .description('Open a pull request for a completed task')
    .option('--skip-verify', 'Skip verification check before opening PR')
    .action(async (taskId: string, opts: { skipVerify?: boolean }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }

      const config = loadConfig(root);
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}.\n`); process.exit(1); }

      const repoName = path.basename(root);
      const worktreePath = path.join(path.dirname(root), `${repoName}-gecko-${taskId}`);
      const branch = await currentBranch(worktreePath);

      // Verification
      let verificationResults: ReturnType<typeof runVerificationSuite> extends Promise<infer T> ? T : never = [];
      if (!opts.skipVerify) {
        process.stdout.write('Running verification...\n');
        verificationResults = await runVerificationSuite(config.verification, worktreePath);
        const failed = verificationResults.filter((r) => !r.passed);
        if (failed.length > 0) {
          const { proceed } = await inquirer.prompt([{
            name: 'proceed',
            type: 'confirm',
            message: `${failed.length} verification command(s) failed. Open PR anyway?`,
            default: false,
          }]);
          if (!proceed) { process.stdout.write('Aborted.\n'); process.exit(1); }
        }
      }

      // Commit pending changes
      await commitAll(worktreePath, `feat(${taskId}): agent changes`).catch(() => { /* nothing to commit */ });

      // Push branch
      process.stdout.write(`Pushing branch ${branch}...\n`);
      await pushBranch(worktreePath, branch);

      // Detect GitHub remote for PR URL hint
      const remote = await getRepoRemote(root).catch(() => null);
      const files = await changedFiles(worktreePath).catch(() => []);

      // Send event to Gecko API
      await client.sendPrEvent({
        task_id: taskId,
        agent_id: identity.agent_id,
        claim_id: claim.claim_id,
        branch,
        changed_files: files,
        verification_results: verificationResults,
        remote,
      });

      process.stdout.write(`\n✓ Branch pushed: ${branch}\n`);
      if (remote?.includes('github.com')) {
        const ghBase = remote.replace(/\.git$/, '').replace('git@github.com:', 'https://github.com/');
        process.stdout.write(`  Open PR: ${ghBase}/compare/${branch}?expand=1\n`);
      }
      process.stdout.write(`\nNote: The CLI never merges automatically. A human must review and merge.\n`);
    });
}
