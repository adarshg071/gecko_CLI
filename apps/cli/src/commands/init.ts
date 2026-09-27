import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { findProjectRoot, writeConfig, ensureGeckoDir } from '../core/config.js';
import { v4 as uuid } from 'uuid';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a Gecko project in the current directory')
    .option('--name <name>', 'Project name', path.basename(process.cwd()))
    .option('--description <desc>', 'Project description', '')
    .action(async (opts: { name: string; description: string }) => {
      const cwd = process.cwd();

      if (findProjectRoot(cwd) === cwd) {
        process.stderr.write('gecko.yml already exists in this directory.\n');
        process.exit(1);
      }

      const projectId = uuid();

      writeConfig(
        {
          project_id: projectId,
          name: opts.name,
          description: opts.description,
          api_url: process.env['GECKO_API_URL'] ?? 'https://gecko-ashy.vercel.app',
          verification: ['npm test'],
        },
        cwd,
      );

      ensureGeckoDir(cwd);

      // Create plan.md template
      if (!fs.existsSync(path.join(cwd, 'plan.md'))) {
        fs.writeFileSync(
          path.join(cwd, 'plan.md'),
          `# Project Plan\n\nDescribe your project goal here. Gecko will use this to generate tasks.\n`,
          'utf8',
        );
      }

      // Update .gitignore
      const gitignorePath = path.join(cwd, '.gitignore');
      const ignoreLines = [
        '.gecko/cache.db',
        '.gecko/events/local/',
        '.gecko/worktrees/',
        '.env',
      ];
      let existing = '';
      if (fs.existsSync(gitignorePath)) existing = fs.readFileSync(gitignorePath, 'utf8');
      const toAdd = ignoreLines.filter((l) => !existing.includes(l));
      if (toAdd.length > 0) {
        fs.appendFileSync(gitignorePath, '\n# Gecko\n' + toAdd.join('\n') + '\n');
      }

      process.stdout.write(`✓ Initialized Gecko project: ${opts.name} (${projectId})\n`);
      process.stdout.write(`  gecko.yml     — project configuration\n`);
      process.stdout.write(`  plan.md       — edit this to describe your project\n`);
      process.stdout.write(`  .gecko/       — local cache and worktrees\n\n`);
      process.stdout.write(`Next: gecko provider add && gecko connect\n`);
    });
}
