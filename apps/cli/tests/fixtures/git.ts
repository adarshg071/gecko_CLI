/**
 * Test fixture: creates a temporary Git repository and cleans it up after the test.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

export interface GitFixture {
  dir: string;
  cleanup: () => void;
}

export function createGitFixture(): GitFixture {
  const dir = mkdtempSync(join(tmpdir(), 'gecko-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@gecko.test"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Gecko Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# Test Project\n');
  execSync('git add -A && git commit -m "init"', { cwd: dir, stdio: 'pipe', shell: true as unknown as string });
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
