import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { execa } from 'execa';
import { findProjectRoot, loadConfig, getGeckoDir } from '../core/config.js';
import { loadIdentity } from '../core/identity.js';
import { makeApiClient } from '../core/api.js';
import { getDb, getProviders } from '../core/db.js';
import { PlanSchema, ProviderConfigSchema, TaskDefinitionSchema } from '../../../../packages/protocol/src/index.js';
import { buildProvider } from '../providers/index.js';

async function buildPlannerContext(root: string): Promise<string> {
  const parts: string[] = [];

  const planPath = path.join(root, 'plan.md');
  if (fs.existsSync(planPath)) parts.push(`## plan.md\n${fs.readFileSync(planPath, 'utf8')}`);

  const geckoYml = path.join(root, 'gecko.yml');
  if (fs.existsSync(geckoYml)) parts.push(`## gecko.yml\n${fs.readFileSync(geckoYml, 'utf8')}`);

  // Repo tree (top 2 levels)
  const { stdout: tree } = await execa('find', ['.', '-maxdepth', '2', '-not', '-path', './.git/*', '-not', '-path', './node_modules/*'], { cwd: root, reject: false });
  parts.push(`## Repository tree\n${tree}`);

  // Package files
  for (const f of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) parts.push(`## ${f}\n${fs.readFileSync(p, 'utf8').slice(0, 2000)}`);
  }

  // Existing tasks
  const tasksDir = path.join(root, '.gecko', 'tasks');
  if (fs.existsSync(tasksDir)) {
    const taskFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.yml')).slice(0, 20);
    for (const tf of taskFiles) {
      parts.push(`## Existing task: ${tf}\n${fs.readFileSync(path.join(tasksDir, tf), 'utf8')}`);
    }
  }

  // README
  const readmePath = path.join(root, 'README.md');
  if (fs.existsSync(readmePath)) parts.push(`## README.md\n${fs.readFileSync(readmePath, 'utf8').slice(0, 3000)}`);

  return parts.join('\n\n');
}

export function registerPlanCommand(program: Command): void {
  const plan = program.command('plan').description('Manage project plans');

  plan
    .command('generate')
    .description('Generate a task plan using the configured provider')
    .option('--provider <id>', 'Provider to use')
    .action(async (opts: { provider?: string }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }

      const config = loadConfig(root);
      const db = getDb(getGeckoDir(root));
      const providers = getProviders(db);

      const providerId = opts.provider ?? config.default_provider ?? (providers[0] as { id: string } | undefined)?.id;
      if (!providerId) { process.stderr.write('No provider configured. Run: gecko provider add\n'); process.exit(1); }

      const rawConfig = providers.find((p) => (p as { id: string }).id === providerId);
      if (!rawConfig) { process.stderr.write(`Provider '${providerId}' not found.\n`); process.exit(1); }

      const provConfig = ProviderConfigSchema.parse(rawConfig);
      const envKey = `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`;
      const apiKey = process.env[envKey] ?? process.env['IBM_BOB_API_KEY'] ?? '';
      const provider = buildProvider(provConfig, apiKey);

      process.stdout.write('Building planner context...\n');
      const context = await buildPlannerContext(root);

      process.stdout.write('Generating plan (this may take a minute)...\n');

      const systemPrompt = `You are a software project planner. Given a project description and codebase context, generate a structured task plan. Return ONLY valid JSON matching this exact schema — no markdown, no explanation:\n{"goal":"string","tasks":[{"display_id":"TASK-001","title":"string","description":"string","acceptance_criteria":["string"],"expected_files":["string"],"verification_commands":["string"],"depends_on":[],"risk":"low|medium|high"}]}`;

      const output = await provider.generate({
        system_prompt: systemPrompt,
        messages: [{ role: 'user', content: context }],
      });

      let plan: ReturnType<typeof PlanSchema.parse>;
      try {
        plan = PlanSchema.parse(JSON.parse(output.content));
      } catch (err) {
        process.stderr.write(`Provider returned invalid plan JSON: ${err instanceof Error ? err.message : String(err)}\n`);
        process.stderr.write(`Raw output:\n${output.content.slice(0, 500)}\n`);
        process.exit(1);
      }

      const tasksDir = path.join(root, '.gecko', 'tasks');
      fs.mkdirSync(tasksDir, { recursive: true });
      for (const task of plan.tasks) {
        fs.writeFileSync(path.join(tasksDir, `${task.display_id}.yml`), yaml.dump(task), 'utf8');
      }

      process.stdout.write(`\n✓ Generated ${plan.tasks.length} tasks\n`);
      process.stdout.write(`  Goal: ${plan.goal}\n\n`);
      for (const t of plan.tasks) {
        process.stdout.write(`  ${t.display_id}: ${t.title} [${t.risk}]\n`);
      }
      process.stdout.write(`\nReview with: gecko plan review\nApprove with: gecko plan approve\n`);
    });

  plan
    .command('review')
    .description('Display draft tasks for review')
    .action(() => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const tasksDir = path.join(root, '.gecko', 'tasks');
      if (!fs.existsSync(tasksDir)) { process.stdout.write('No draft tasks. Run: gecko plan generate\n'); return; }
      const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.yml'));
      if (files.length === 0) { process.stdout.write('No draft tasks found.\n'); return; }
      for (const f of files.sort()) {
        const raw = fs.readFileSync(path.join(tasksDir, f), 'utf8');
        const task = TaskDefinitionSchema.parse(yaml.load(raw));
        process.stdout.write(`\n── ${task.display_id}: ${task.title} [${task.risk}] ──\n`);
        process.stdout.write(`  ${task.description}\n`);
        process.stdout.write(`  Files: ${task.expected_files.join(', ')}\n`);
        process.stdout.write(`  Verify: ${task.verification_commands.join(', ')}\n`);
      }
    });

  plan
    .command('approve')
    .description('Upload the draft plan to the Gecko API and push task files to Git')
    .action(async () => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project.\n'); process.exit(1); }
      const tasksDir = path.join(root, '.gecko', 'tasks');
      if (!fs.existsSync(tasksDir)) { process.stderr.write('No draft tasks to approve.\n'); process.exit(1); }

      const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.yml'));
      const tasks = files.map((f) => TaskDefinitionSchema.parse(yaml.load(fs.readFileSync(path.join(tasksDir, f), 'utf8'))));

      const identity = loadIdentity();
      const client = makeApiClient(identity);
      const config = loadConfig(root);

      process.stdout.write(`Uploading ${tasks.length} tasks to Gecko API...\n`);
      await client.uploadPlan(config.project_id, { tasks });
      await client.approvePlan(config.project_id);

      // Copy tasks to committed location
      const committedDir = path.join(root, '.gecko', 'tasks');
      process.stdout.write('✓ Plan approved and uploaded.\n');
      process.stdout.write('Run: gecko tasks\n');
    });
}
