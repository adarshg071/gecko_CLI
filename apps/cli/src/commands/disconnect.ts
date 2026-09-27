import { Command } from 'commander';
import { loadIdentity, removeIdentity, hasIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';

export function registerDisconnectCommand(program: Command): void {
  program
    .command('disconnect')
    .description('Disconnect this machine from the Gecko project')
    .action(async () => {
      if (!hasIdentity()) {
        process.stderr.write('Not connected.\n');
        process.exit(1);
      }
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      try {
        await client.revokeToken();
      } catch {
        process.stderr.write('Warning: could not revoke token on server. Removing local credentials anyway.\n');
      }
      removeIdentity();
      process.stdout.write('✓ Disconnected and credentials removed.\n');
    });
}
