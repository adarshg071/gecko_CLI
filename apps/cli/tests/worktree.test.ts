import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGitFixture, GitFixture } from './fixtures/git.ts';
import { createWorktree, listWorktrees, branchExists } from '../src/git/worktree.ts';
import path from 'path';
import fs from 'fs';

describe('Worktree creation', () => {
  let fixture: GitFixture;

  beforeEach(() => {
    fixture = createGitFixture();
  });

  afterEach(() => {
    // Remove worktrees first
    const repoName = path.basename(fixture.dir);
    const wt = path.join(path.dirname(fixture.dir), `${repoName}-gecko-TASK-001`);
    if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
    fixture.cleanup();
  });

  it('creates a worktree for a task', async () => {
    const { worktreePath, branch } = await createWorktree({
      repoRoot: fixture.dir,
      taskId: 'TASK-001',
      agentId: 'agent-1',
      attemptNumber: 1,
    });
    expect(fs.existsSync(worktreePath)).toBe(true);
    expect(branch).toBe('gecko/agent-1/TASK-001-attempt-1');
  });

  it('includes the task branch in the branch name', async () => {
    const { branch } = await createWorktree({
      repoRoot: fixture.dir,
      taskId: 'TASK-002',
      agentId: 'agent-x',
      attemptNumber: 2,
    });
    expect(branch).toContain('TASK-002');
    expect(branch).toContain('attempt-2');

    // cleanup
    const repoName = path.basename(fixture.dir);
    const wt = path.join(path.dirname(fixture.dir), `${repoName}-gecko-TASK-002`);
    if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
  });

  it('creates the branch if it does not exist', async () => {
    const { branch } = await createWorktree({
      repoRoot: fixture.dir,
      taskId: 'TASK-003',
      agentId: 'agent-y',
      attemptNumber: 1,
    });
    const exists = await branchExists(fixture.dir, branch);
    expect(exists).toBe(true);

    const repoName = path.basename(fixture.dir);
    const wt = path.join(path.dirname(fixture.dir), `${repoName}-gecko-TASK-003`);
    if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
  });

  it('lists worktrees', async () => {
    const trees = await listWorktrees(fixture.dir);
    expect(trees.length).toBeGreaterThanOrEqual(1); // main worktree
  });
});
