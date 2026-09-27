import { execa } from 'execa';
import path from 'path';
import fs from 'fs';

export async function git(args: string[], cwd: string): Promise<string> {
  const result = await execa('git', args, { cwd, reject: false });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export async function gitSafe(args: string[], cwd: string): Promise<string | null> {
  try { return await git(args, cwd); }
  catch { return null; }
}

export async function currentBranch(cwd: string): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export async function isDirty(cwd: string): Promise<boolean> {
  const out = await git(['status', '--porcelain'], cwd);
  return out.length > 0;
}

export async function changedFiles(cwd: string, base?: string): Promise<string[]> {
  const ref = base ?? 'HEAD';
  const out = await gitSafe(['diff', '--name-only', ref], cwd);
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const out = await gitSafe(['branch', '--list', branch], cwd);
  return (out ?? '').includes(branch);
}

export async function remoteBranchExists(cwd: string, branch: string): Promise<boolean> {
  const out = await gitSafe(['ls-remote', '--heads', 'origin', branch], cwd);
  return (out ?? '').length > 0;
}

/**
 * Create a worktree for a task.
 * Worktree lives at ../project-gecko-TASK_ID/ relative to the repo root.
 */
export async function createWorktree(opts: {
  repoRoot: string;
  taskId: string;
  agentId: string;
  attemptNumber: number;
}): Promise<{ worktreePath: string; branch: string }> {
  const { repoRoot, taskId, agentId, attemptNumber } = opts;
  const branch = `gecko/${agentId}/${taskId}-attempt-${attemptNumber}`;
  const repoName = path.basename(repoRoot);
  const worktreePath = path.join(path.dirname(repoRoot), `${repoName}-gecko-${taskId}`);

  if (fs.existsSync(worktreePath)) {
    return { worktreePath, branch };
  }

  const exists = await branchExists(repoRoot, branch);
  if (exists) {
    await git(['worktree', 'add', worktreePath, branch], repoRoot);
  } else {
    await git(['worktree', 'add', '-b', branch, worktreePath], repoRoot);
  }
  return { worktreePath, branch };
}

export async function listWorktrees(repoRoot: string): Promise<Array<{ path: string; branch: string; head: string }>> {
  const out = await git(['worktree', 'list', '--porcelain'], repoRoot);
  const trees: Array<{ path: string; branch: string; head: string }> = [];
  let current: Partial<{ path: string; branch: string; head: string }> = {};
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) trees.push(current as { path: string; branch: string; head: string });
      current = { path: line.slice(9), branch: '', head: '' };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7);
    }
  }
  if (current.path) trees.push(current as { path: string; branch: string; head: string });
  return trees;
}

export async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  await git(['worktree', 'remove', '--force', worktreePath], repoRoot);
}

export async function pushBranch(cwd: string, branch: string): Promise<void> {
  await git(['push', '--set-upstream', 'origin', branch], cwd);
}

export async function commitAll(cwd: string, message: string): Promise<void> {
  const dirty = await isDirty(cwd);
  if (!dirty) return;
  await git(['add', '-A'], cwd);
  await git(['commit', '-m', message], cwd);
}

export async function getRepoRemote(cwd: string): Promise<string | null> {
  return gitSafe(['remote', 'get-url', 'origin'], cwd);
}
