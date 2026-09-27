import { Command } from 'commander';
import { findProjectRoot, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getClaim, removeClaim } from '../core/db.js';

export function registerReleaseCommand(program: Command): void {
  program
    .command('release <task_id>')
    .description('Release the claim on a task')
    .action(async (taskId: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}.\n`); process.exit(1); }
      await client.releaseTask(taskId, identity.agent_id, claim.claim_id);
      removeClaim(db, taskId);
      process.stdout.write(`✓ Released ${taskId}.\n`);
    });
}
