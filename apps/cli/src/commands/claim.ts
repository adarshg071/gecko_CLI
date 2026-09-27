import { Command } from 'commander';
import { v4 as uuid } from 'uuid';
import { loadConfig, findProjectRoot, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, saveClaim } from '../core/db.js';
import { ClaimResponseSchema } from '../../../../packages/protocol/src/index.js';

export function registerClaimCommand(program: Command): void {
  program
    .command('claim <task_id>')
    .description('Claim a task from the Gecko API')
    .option('--lease-seconds <n>', 'Lease duration in seconds', '300')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, opts: { leaseSeconds: string; json?: boolean }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const config = loadConfig(root);
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));

      const existing = (await import('../core/db.js')).getClaim(db, taskId);
      let attempt = 1;
      if (existing) attempt = existing.attempt_number + 1;

      const body = {
        project_id: config.project_id,
        task_id: taskId,
        agent_id: identity.agent_id,
        attempt_number: attempt,
        lease_seconds: parseInt(opts.leaseSeconds, 10),
        idempotency_key: uuid(),
      };

      const raw = await client.claimTask(body);
      const result = ClaimResponseSchema.parse(raw);

      if (opts.json) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }

      if (result.success) {
        saveClaim(db, taskId, result.claim_id, result.lease_expires_at, attempt);
        if (!opts.json) {
          process.stdout.write(`✓ Claimed ${taskId}  (claim: ${result.claim_id})\n`);
          process.stdout.write(`  Lease expires: ${result.lease_expires_at}\n`);
          process.stdout.write(`  Next: gecko worktree ${taskId}\n`);
        }
      } else {
        if (!opts.json) {
          process.stderr.write(`✗ Could not claim ${taskId}: ${result.reason}`);
          if (result.owner_agent_id) process.stderr.write(` (owned by ${result.owner_agent_id})`);
          process.stderr.write('\n');
        }
        process.exit(1);
      }
    });
}
