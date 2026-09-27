import { Command } from 'commander';
import path from 'path';
import { findProjectRoot, loadConfig, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb } from '../core/db.js';
import { pullEvents, materializeJsonl, materializeMarkdown } from '../sync/events.js';

export function registerLogCommand(program: Command): void {
  const log = program.command('log').description('Event log commands');

  log
    .command('pull')
    .description('Pull events from the server and write GECKOLOG.jsonl')
    .action(async () => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const config = loadConfig(root);
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));

      const newEvents = await pullEvents(db, client, config.project_id);
      materializeJsonl(db, config.project_id, path.join(root, 'GECKOLOG.jsonl'));
      process.stdout.write(`✓ Pulled ${newEvents.length} new event(s). GECKOLOG.jsonl updated.\n`);
    });

  log
    .command('export')
    .description('Export GECKOLOG.jsonl as human-readable GECKOLOG.md')
    .action(async () => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const config = loadConfig(root);
      const db = getDb(getGeckoDir(root));
      materializeMarkdown(db, config.project_id, path.join(root, 'GECKOLOG.md'));
      process.stdout.write(`✓ GECKOLOG.md written.\n`);
    });
}
