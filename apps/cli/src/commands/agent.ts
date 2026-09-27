import { Command } from 'commander';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';

export function registerAgentCommand(program: Command): void {
  const agent = program.command('agent').description('Manage agent identity');

  agent
    .command('register')
    .description('Register or update agent capabilities with the server')
    .action(async () => {
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      await client.registerAgent(identity.agent_id, { registered_at: new Date().toISOString() });
      process.stdout.write(`✓ Agent ${identity.agent_id} registered.\n`);
    });

  agent
    .command('status')
    .description('Show current agent identity and connection status')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const identity = loadIdentity();
      if (opts.json) {
        // redact token
        process.stdout.write(JSON.stringify({ ...identity, token: '[redacted]' }, null, 2) + '\n');
      } else {
        process.stdout.write(`Agent ID:   ${identity.agent_id}\n`);
        process.stdout.write(`Project ID: ${identity.project_id}\n`);
        process.stdout.write(`API URL:    ${identity.api_url}\n`);
        if (identity.display_name) process.stdout.write(`Name:       ${identity.display_name}\n`);
        process.stdout.write(`Connected:  ${identity.created_at}\n`);
      }
    });

  agent
    .command('rename <name>')
    .description('Set a display name for this agent')
    .action(async (name: string) => {
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      await client.renameAgent(identity.agent_id, name);
      // update local copy
      const { saveIdentity } = await import('../core/identity.js');
      saveIdentity({ ...identity, display_name: name });
      process.stdout.write(`✓ Agent renamed to: ${name}\n`);
    });
}
