import { Command } from 'commander';
import { findProjectRoot, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getClaim } from '../core/db.js';

export function registerRequeueCommand(program: Command): void {
  program
    .command('requeue <task_id>')
    .description('Requeue a task so another agent can claim it')
    .action(async (taskId: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}.\n`); process.exit(1); }
      await client.requeueTask(taskId, identity.agent_id, claim.claim_id);
      process.stdout.write(`✓ Task ${taskId} requeued.\n`);
    });
}
