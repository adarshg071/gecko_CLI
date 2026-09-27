import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { execa } from 'execa';
import chokidar from 'chokidar';
import { findProjectRoot, loadConfig, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getClaim } from '../core/db.js';
import { createWorktree, currentBranch, changedFiles } from '../git/worktree.js';
import { HeartbeatLoop } from '../agents/heartbeat.js';
import { runVerificationSuite } from '../verification/runner.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run <task_id>')
    .description('Run the configured agent on a task. Use -- to pass agent command.')
    .allowUnknownOption()
    .action(async (taskId: string, _opts: unknown, cmd: Command) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }

      const config = loadConfig(root);
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const db = getDb(getGeckoDir(root));

      const claim = getClaim(db, taskId);
      if (!claim) { process.stderr.write(`No active claim for ${taskId}. Run: gecko claim ${taskId}\n`); process.exit(1); }

      // Ensure worktree exists
      const { worktreePath, branch } = await createWorktree({
        repoRoot: root,
        taskId,
        agentId: identity.agent_id,
        attemptNumber: claim.attempt_number,
      });

      process.stdout.write(`Running ${taskId} in ${worktreePath} on branch ${branch}\n`);

      const heartbeat = new HeartbeatLoop(client, {
        agentId: identity.agent_id,
        taskId,
        claimId: claim.claim_id,
        status: 'in_progress',
        currentBranch: branch,
        changedFiles: [],
      });

      let agentExited = false;
      heartbeat.onClaimExpired(() => {
        if (!agentExited) {
          process.stderr.write('Claim expired. Stopping agent.\n');
          process.exit(1);
        }
      });
      heartbeat.start();

      // File watcher
      const changed = new Set<string>();
      const watcher = chokidar.watch(worktreePath, {
        ignored: [/node_modules/, /\.git/],
        persistent: true,
        ignoreInitial: true,
      });
      watcher.on('all', (_event: string, filePath: string) => {
        changed.add(path.relative(worktreePath, filePath));
        heartbeat.updateContext({ changedFiles: [...changed] });
      });

      // Parse agent command from args after '--'
      const rawArgs = process.argv;
      const sep = rawArgs.indexOf('--');
      const agentArgs = sep !== -1 ? rawArgs.slice(sep + 1) : [];
      const [agentBin, ...agentRestArgs] = agentArgs;

      if (!agentBin) {
        process.stderr.write('Specify agent command after --. Example: gecko run TASK-001 -- bob\n');
        heartbeat.stop();
        process.exit(1);
      }

      // Resolve task context for the agent
      const taskFilePath = path.join(root, '.gecko', 'tasks', `${taskId}.yml`);
      const taskContext = fs.existsSync(taskFilePath)
        ? fs.readFileSync(taskFilePath, 'utf8')
        : `Task ID: ${taskId}`;

      // Pass task context as env var — never embed credentials
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        GECKO_TASK_ID: taskId,
        GECKO_TASK_CONTEXT: taskContext,
        GECKO_CLAIM_ID: claim.claim_id,
        GECKO_WORKTREE: worktreePath,
        GECKO_BRANCH: branch,
      };

      let exitCode = 0;
      try {
        const result = await execa(agentBin, agentRestArgs, {
          cwd: worktreePath,
          env,
          stdio: 'inherit',
          reject: false,
        });
        exitCode = result.exitCode ?? 0;
      } catch (err) {
        exitCode = 1;
        process.stderr.write(`Agent process error: ${err instanceof Error ? err.message : String(err)}\n`);
      } finally {
        agentExited = true;
        heartbeat.stop();
        await watcher.close();
      }

      if (exitCode !== 0) {
        process.stderr.write(`Agent exited with code ${exitCode}. Running verification...\n`);
        const results = await runVerificationSuite(config.verification, worktreePath);
        const failed = results.filter((r) => !r.passed);
        if (failed.length > 0) {
          process.stderr.write(`Verification failed:\n`);
          for (const f of failed) process.stderr.write(`  ${f.command}: exit ${f.exit_code}\n`);
        }
        await client.sendPrEvent({
          type: 'task.failed',
          task_id: taskId,
          claim_id: claim.claim_id,
          agent_id: identity.agent_id,
          exit_code: exitCode,
          changed_files: [...changed],
          verification_results: results,
        }).catch(() => {});
        process.exit(exitCode);
      }

      process.stdout.write(`✓ Agent completed ${taskId}.\nRun: gecko verify ${taskId}\n`);
    });
}
