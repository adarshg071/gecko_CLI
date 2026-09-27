import { Command } from 'commander';
import { loadConfig, findProjectRoot } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';

export function registerTasksCommand(program: Command): void {
  program
    .command('tasks')
    .description('List available tasks')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const config = loadConfig(root);
      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const tasks = await client.listTasks(config.project_id) as Array<Record<string, unknown>>;

      if (opts.json) {
        process.stdout.write(JSON.stringify(tasks, null, 2) + '\n');
        return;
      }
      if (tasks.length === 0) {
        process.stdout.write('No tasks found. Run: gecko plan generate\n');
        return;
      }
      for (const t of tasks) {
        const deps = Array.isArray(t['depends_on']) && t['depends_on'].length > 0
          ? ` [needs: ${(t['depends_on'] as string[]).join(', ')}]`
          : '';
        process.stdout.write(`  ${String(t['display_id'] ?? '')}  ${String(t['state'] ?? '').padEnd(12)} ${String(t['title'] ?? '')}${deps}\n`);
      }
    });

  program
    .command('task')
    .description('Task operations')
    .addCommand(
      new Command('show')
        .argument('<task_id>', 'Task ID')
        .description('Show task details')
        .option('--json', 'Output as JSON')
        .action(async (taskId: string, opts: { json?: boolean }) => {
          const root = findProjectRoot();
          if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
          const config = loadConfig(root);
          const identity = loadIdentity();
          const client = makeApiClient(identity);
          const task = await client.getTask(config.project_id, taskId) as Record<string, unknown>;
          if (opts.json) {
            process.stdout.write(JSON.stringify(task, null, 2) + '\n');
          } else {
            for (const [k, v] of Object.entries(task)) {
              process.stdout.write(`${k}: ${JSON.stringify(v)}\n`);
            }
          }
        })
    )
    .addCommand(
      new Command('add')
        .argument('<title>', 'Task title')
        .description('Add a new task')
        .action(async (title: string) => {
          const root = findProjectRoot();
          if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
          const config = loadConfig(root);
          const identity = loadIdentity();
          const client = makeApiClient(identity);
          await client.createTask(config.project_id, { title });
          process.stdout.write(`✓ Task added: ${title}\n`);
        })
    );
}
