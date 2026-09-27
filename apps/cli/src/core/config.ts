import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { GeckoConfig, GeckoConfigSchema } from '../../../../packages/protocol/src/index.js';

export function findProjectRoot(start: string = process.cwd()): string | null {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, 'gecko.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(projectRoot?: string): GeckoConfig {
  const root = projectRoot ?? findProjectRoot();
  if (!root) throw new Error('Not inside a Gecko project. Run `gecko init` first.');
  const raw = fs.readFileSync(path.join(root, 'gecko.yml'), 'utf8');
  return GeckoConfigSchema.parse(yaml.load(raw));
}

export function writeConfig(config: GeckoConfig, projectRoot: string): void {
  fs.writeFileSync(
    path.join(projectRoot, 'gecko.yml'),
    yaml.dump(config),
    'utf8',
  );
}

export function getGeckoDir(projectRoot: string): string {
  return path.join(projectRoot, '.gecko');
}

export function ensureGeckoDir(projectRoot: string): void {
  const base = getGeckoDir(projectRoot);
  for (const sub of ['tasks', 'events', 'worktrees']) {
    fs.mkdirSync(path.join(base, sub), { recursive: true });
  }
}
