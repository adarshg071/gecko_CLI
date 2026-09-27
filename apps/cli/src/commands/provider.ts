import { Command } from 'commander';
import inquirer from 'inquirer';
import { findProjectRoot, getGeckoDir } from '../core/config.js';
import { getDb, saveProvider, getProviders, removeProvider } from '../core/db.js';
import { ProviderConfigSchema } from '../../../../packages/protocol/src/index.js';
import { buildProvider } from '../providers/index.js';

export function registerProviderCommand(program: Command): void {
  const prov = program.command('provider').description('Manage AI providers');

  prov
    .command('add')
    .description('Configure a new provider')
    .action(async () => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }

      const answers = await inquirer.prompt([
        { name: 'id', message: 'Provider ID:', validate: (s: string) => s.length > 0 || 'Required' },
        {
          name: 'type', message: 'Provider type:', type: 'list',
          choices: ['openai-compatible', 'ibm-bob', 'mock'],
        },
        { name: 'base_url', message: 'Base URL:', when: (a: { type: string }) => a.type !== 'ibm-bob' && a.type !== 'mock' },
        { name: 'model', message: 'Model name:', when: (a: { type: string }) => a.type !== 'ibm-bob' && a.type !== 'mock' },
        {
          name: 'api_key', message: 'API key (stored in env, not saved here):',
          type: 'password',
          when: (a: { type: string }) => a.type !== 'ibm-bob' && a.type !== 'mock',
        },
        { name: 'supports_tool_calls', message: 'Supports tool calls?', type: 'confirm', default: true },
        { name: 'supports_streaming', message: 'Supports streaming?', type: 'confirm', default: true },
      ]);

      const config = ProviderConfigSchema.parse({
        id: answers.id as string,
        type: answers.type as string,
        base_url: (answers.base_url as string | undefined) ?? '',
        model: (answers.model as string | undefined) ?? '',
        supports_tool_calls: answers.supports_tool_calls as boolean,
        supports_streaming: answers.supports_streaming as boolean,
      });

      const db = getDb(getGeckoDir(root));
      saveProvider(db, config);

      process.stdout.write(`✓ Provider '${config.id}' saved.\n`);
      if (answers.api_key) {
        process.stdout.write(`  API key NOT stored here. Set it in your environment:\n`);
        process.stdout.write(`  export ${config.id.toUpperCase().replace(/-/g, '_')}_API_KEY=<your-key>\n`);
      }
    });

  prov
    .command('list')
    .description('List configured providers')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const db = getDb(getGeckoDir(root));
      const providers = getProviders(db);
      if (opts.json) {
        process.stdout.write(JSON.stringify(providers, null, 2) + '\n');
      } else if (providers.length === 0) {
        process.stdout.write('No providers configured. Run: gecko provider add\n');
      } else {
        for (const p of providers) {
          const c = p as { id: string; type: string; model?: string };
          process.stdout.write(`  ${c.id}  (${c.type}${c.model ? ` / ${c.model}` : ''})\n`);
        }
      }
    });

  prov
    .command('remove <id>')
    .description('Remove a provider')
    .action((id: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const db = getDb(getGeckoDir(root));
      removeProvider(db, id);
      process.stdout.write(`✓ Provider '${id}' removed.\n`);
    });

  prov
    .command('test <id>')
    .description('Send a test generation request to a provider')
    .action(async (id: string) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const db = getDb(getGeckoDir(root));
      const providers = getProviders(db);
      const config = providers.find((p) => (p as { id: string }).id === id);
      if (!config) { process.stderr.write(`Provider '${id}' not found.\n`); process.exit(1); }

      const c = config as { id: string; type: string; base_url: string; model: string };
      const envKey = `${c.id.toUpperCase().replace(/-/g, '_')}_API_KEY`;
      const apiKey = process.env[envKey] ?? process.env['IBM_BOB_API_KEY'] ?? '';

      try {
        const parsed = ProviderConfigSchema.parse(config);
        const provider = buildProvider(parsed, apiKey);
        const out = await provider.generate({ messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }] });
        process.stdout.write(`✓ Provider '${id}' responded: ${out.content.slice(0, 100)}\n`);
      } catch (err) {
        process.stderr.write(`✗ Provider test failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });
}
