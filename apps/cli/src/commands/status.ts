import { Command } from 'commander';
import path from 'path';
import { findProjectRoot, loadConfig, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getClaim } from '../core/db.js';
import { pullEvents } from '../sync/events.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show project and agent status')
    .option('--watch', 'Continuously poll and refresh status')
    .option('--json', 'Output as JSON')
    .action(async (opts: { watch?: boolean; json?: boolean }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const config = loadConfig(root);
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));

      const showStatus = async () => {
        const tasks = await client.listTasks(config.project_id) as Array<Record<string, unknown>>;
        const statusObj = {
          project: config.name,
          project_id: config.project_id,
          agent_id: identity.agent_id,
          tasks: tasks.map((t) => ({ id: t['display_id'], title: t['title'], state: t['state'] })),
        };
        if (opts.json) {
          process.stdout.write(JSON.stringify(statusObj, null, 2) + '\n');
        } else {
          if (opts.watch) process.stdout.write('\x1Bc'); // clear screen
          process.stdout.write(`Project: ${config.name} (${config.project_id})\n`);
          process.stdout.write(`Agent:   ${identity.agent_id}\n\n`);
          for (const t of tasks) {
            process.stdout.write(`  ${String(t['display_id'] ?? '').padEnd(12)} ${String(t['state'] ?? '').padEnd(15)} ${String(t['title'] ?? '')}\n`);
          }
          if (opts.watch) process.stdout.write(`\nLast updated: ${new Date().toLocaleTimeString()}\n`);
        }
      };

      await showStatus();

      if (opts.watch) {
        // Pull events and refresh every 10 seconds
        const loop = setInterval(async () => {
          try {
            await pullEvents(db, client, config.project_id);
            await showStatus();
          } catch { /* keep watching on transient errors */ }
        }, 10_000);
        // Exit on Ctrl+C
        process.on('SIGINT', () => { clearInterval(loop); process.exit(0); });
      }
    });
}
