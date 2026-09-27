import { z } from 'zod';

// ── Task states ──────────────────────────────────────────────────────────────

export const TaskStateSchema = z.enum([
  'draft',
  'ready',
  'claimed',
  'in_progress',
  'testing',
  'blocked',
  'failed',
  'stale',
  'requeued',
  'review',
  'completed',
  'cancelled',
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

// ── Task definition ──────────────────────────────────────────────────────────

export const TaskDefinitionSchema = z.object({
  display_id: z.string(),
  title: z.string(),
  description: z.string(),
  acceptance_criteria: z.array(z.string()),
  expected_files: z.array(z.string()),
  verification_commands: z.array(z.string()),
  depends_on: z.array(z.string()),
  risk: z.enum(['low', 'medium', 'high']),
  state: TaskStateSchema.optional().default('draft'),
});
export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;

// ── Planner output ───────────────────────────────────────────────────────────

export const PlanSchema = z.object({
  goal: z.string(),
  tasks: z.array(TaskDefinitionSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

// ── Claim ────────────────────────────────────────────────────────────────────

export const ClaimRequestSchema = z.object({
  project_id: z.string(),
  task_id: z.string(),
  agent_id: z.string(),
  attempt_number: z.number().int().positive(),
  lease_seconds: z.number().int().positive().default(300),
  idempotency_key: z.string().uuid(),
});
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

export const ClaimSuccessSchema = z.object({
  success: z.literal(true),
  claim_id: z.string(),
  lease_expires_at: z.string().datetime(),
});
export type ClaimSuccess = z.infer<typeof ClaimSuccessSchema>;

export const ClaimConflictSchema = z.object({
  success: z.literal(false),
  reason: z.string(),
  owner_agent_id: z.string().optional(),
});
export type ClaimConflict = z.infer<typeof ClaimConflictSchema>;

export const ClaimResponseSchema = z.discriminatedUnion('success', [
  ClaimSuccessSchema,
  ClaimConflictSchema,
]);
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

// ── Heartbeat ────────────────────────────────────────────────────────────────

export const HeartbeatPayloadSchema = z.object({
  agent_id: z.string(),
  task_id: z.string(),
  claim_id: z.string(),
  status: TaskStateSchema,
  current_command: z.string().optional(),
  current_branch: z.string().optional(),
  changed_files: z.array(z.string()).optional(),
  process_id: z.number().int().optional(),
});
export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;

// ── Events ───────────────────────────────────────────────────────────────────

export const GeckoEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int(),
  project_id: z.string(),
  type: z.string(),
  payload: z.record(z.unknown()),
  created_at: z.string().datetime(),
});
export type GeckoEvent = z.infer<typeof GeckoEventSchema>;

export const EventsResponseSchema = z.object({
  events: z.array(GeckoEventSchema),
  last_sequence: z.number().int(),
});
export type EventsResponse = z.infer<typeof EventsResponseSchema>;

// ── Agent identity ───────────────────────────────────────────────────────────

export const AgentIdentitySchema = z.object({
  agent_id: z.string(),
  project_id: z.string(),
  display_name: z.string().optional(),
  api_url: z.string().url(),
  token: z.string(),
  created_at: z.string().datetime(),
});
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

// ── Provider config ──────────────────────────────────────────────────────────

export const ProviderConfigSchema = z.object({
  id: z.string(),
  type: z.string(),
  base_url: z.string(),
  model: z.string(),
  supports_tool_calls: z.boolean(),
  supports_streaming: z.boolean(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// ── Provider adapter interfaces ──────────────────────────────────────────────

export interface ProviderCapabilities {
  tool_calls: boolean;
  streaming: boolean;
  json_mode: boolean;
}

export interface AgentInput {
  system_prompt?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  task?: TaskDefinition;
  context?: Record<string, unknown>;
}

export interface AgentOutput {
  content: string;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'error';
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export type AgentEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'done'; finish_reason: string };

export interface AgentProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(input: AgentInput): Promise<AgentOutput>;
  stream?(input: AgentInput): AsyncIterable<AgentEvent>;
}

// ── Failure categories ───────────────────────────────────────────────────────

export const FailureCategorySchema = z.enum([
  'provider_timeout',
  'provider_rate_limit',
  'agent_process_failed',
  'tests_failed',
  'build_failed',
  'task_blocked',
  'permission_denied',
  'unknown',
]);
export type FailureCategory = z.infer<typeof FailureCategorySchema>;

// ── Verification result ──────────────────────────────────────────────────────

export const VerificationResultSchema = z.object({
  command: z.string(),
  exit_code: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  passed: z.boolean(),
  duration_ms: z.number().int(),
  timed_out: z.boolean(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// ── Checkpoint ───────────────────────────────────────────────────────────────

export const CheckpointSchema = z.object({
  task_id: z.string(),
  claim_id: z.string(),
  message: z.string(),
  changed_files: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

// ── Handoff ───────────────────────────────────────────────────────────────────

export const HandoffSchema = z.object({
  task_id: z.string(),
  claim_id: z.string(),
  attempt_number: z.number().int(),
  completed_work: z.string(),
  incomplete_work: z.string(),
  current_assumptions: z.string(),
  failing_commands: z.array(z.string()),
  changed_files: z.array(z.string()),
  suggested_next_step: z.string(),
  timestamp: z.string().datetime(),
});
export type Handoff = z.infer<typeof HandoffSchema>;

// ── gecko.yml ────────────────────────────────────────────────────────────────

export const GeckoConfigSchema = z.object({
  project_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  api_url: z.string().url().default('https://gecko-ashy.vercel.app'),
  verification: z.array(z.string()).default([]),
  default_provider: z.string().optional(),
});
export type GeckoConfig = z.infer<typeof GeckoConfigSchema>;
