import { Command } from 'commander';
import { findProjectRoot, loadConfig, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getEvents } from '../core/db.js';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs <task_id>')
    .description('Show events for a specific task')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, opts: { json?: boolean }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const config = loadConfig(root);
      const db = getDb(getGeckoDir(root));
      const events = getEvents(db, config.project_id).filter(
        (e) => (e.payload as Record<string, unknown>)['task_id'] === taskId
      );

      if (opts.json) {
        process.stdout.write(JSON.stringify(events, null, 2) + '\n');
      } else if (events.length === 0) {
        process.stdout.write(`No cached events for ${taskId}. Run: gecko log pull\n`);
      } else {
        for (const e of events) {
          process.stdout.write(`[${e.sequence}] ${e.type}  ${e.created_at}\n`);
        }
      }
    });
}
