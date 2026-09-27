import { Command } from 'commander';
import { findProjectRoot } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getClaim } from '../core/db.js';
import path from 'path';

export function registerReserveCommand(program: Command): void {
  program
    .command('reserve <task_id> [paths...]')
    .description('Declare files this task intends to modify')
    .action(async (taskId: string, filePaths: string[]) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(path.join(root, '.gecko'));
      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}.\n`); process.exit(1); }

      const result = await client.reserveFiles(taskId, identity.agent_id, claim.claim_id, filePaths);
      if (result.accepted) {
        process.stdout.write(`✓ Reservation accepted for ${filePaths.length} file(s).\n`);
      } else {
        process.stdout.write(`⚠ Reservation advisory — conflicts: ${result.conflicts.join(', ')}\n`);
        process.stdout.write(`  Git will handle final merge resolution.\n`);
      }
    });
}
