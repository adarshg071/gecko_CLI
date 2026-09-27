#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerConnectCommand } from './commands/connect.js';
import { registerDisconnectCommand } from './commands/disconnect.js';
import { registerAgentCommand } from './commands/agent.js';
import { registerProviderCommand } from './commands/provider.js';
import { registerPlanCommand } from './commands/plan.js';
import { registerTasksCommand } from './commands/tasks.js';
import { registerClaimCommand } from './commands/claim.js';
import { registerReleaseCommand } from './commands/release.js';
import { registerRequeueCommand } from './commands/requeue.js';
import { registerWorktreeCommand } from './commands/worktree.js';
import { registerRunCommand } from './commands/run.js';
import { registerCheckpointCommand } from './commands/checkpoint.js';
import { registerReserveCommand } from './commands/reserve.js';
import { registerVerifyCommand } from './commands/verify.js';
import { registerStatusCommand } from './commands/status.js';
import { registerLogsCommand } from './commands/logs.js';
import { registerLogCommand } from './commands/log.js';
import { registerPrCommand } from './commands/pr.js';

const program = new Command();

program
  .name('gecko')
  .description('Gecko CLI - local agent execution client')
  .version('0.1.0');

registerInitCommand(program);
registerConnectCommand(program);
registerDisconnectCommand(program);
registerAgentCommand(program);
registerProviderCommand(program);
registerPlanCommand(program);
registerTasksCommand(program);
registerClaimCommand(program);
registerReleaseCommand(program);
registerRequeueCommand(program);
registerWorktreeCommand(program);
registerRunCommand(program);
registerCheckpointCommand(program);
registerReserveCommand(program);
registerVerifyCommand(program);
registerStatusCommand(program);
registerLogsCommand(program);
registerLogCommand(program);
registerPrCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
