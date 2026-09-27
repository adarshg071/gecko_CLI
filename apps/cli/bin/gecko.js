#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const cliRoot = join(dirname(__filename), '..'); // apps/cli/

// If dist/index.js exists (built production), run it directly
const distEntry = join(cliRoot, 'dist', 'index.js');
if (existsSync(distEntry)) {
  const result = spawnSync(process.execPath, [distEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 0);
} else {
  // Development: find tsx in node_modules up the tree
  const candidates = [
    join(cliRoot, 'node_modules', '.bin', 'tsx'),
    join(cliRoot, '..', '..', 'node_modules', '.bin', 'tsx'), // monorepo root
  ];
  const tsx = candidates.find(existsSync);
  if (!tsx) {
    process.stderr.write('gecko: tsx not found. Run: npm install inside apps/cli\n');
    process.exit(1);
  }
  const srcEntry = join(cliRoot, 'src', 'index.ts');
  const result = spawnSync(process.execPath, [tsx, srcEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 0);
}
