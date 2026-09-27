/**
 * IBM Bob provider adapter.
 *
 * Reads IBM_BOB_API_KEY, IBM_BOB_BASE_URL, IBM_BOB_MODEL from environment.
 * The exact IBM Bob API schema is not publicly documented here; this adapter
 * isolates all Bob HTTP calls in one file so it can be updated once the schema
 * is confirmed. For now it delegates to the OpenAI-compatible adapter since
 * Bob exposes an OpenAI-compatible endpoint.
 *
 * Set IBM_BOB_BASE_URL to the actual Bob endpoint when known.
 */

import {
  AgentProvider,
  AgentInput,
  AgentOutput,
  AgentEvent,
  ProviderCapabilities,
} from '../../../../packages/protocol/src/index.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}. Set it before using the IBM Bob provider.`);
  return val;
}

export class IBMBobProvider implements AgentProvider {
  readonly id = 'ibm-bob';
  readonly capabilities: ProviderCapabilities = {
    tool_calls: false, // Update when Bob tool-call support is confirmed
    streaming: true,
    json_mode: true,
  };

  private readonly delegate: OpenAICompatibleProvider;

  constructor() {
    const apiKey = requireEnv('IBM_BOB_API_KEY');
    const baseUrl = requireEnv('IBM_BOB_BASE_URL');
    const model = requireEnv('IBM_BOB_MODEL');
    this.delegate = new OpenAICompatibleProvider({
      id: 'ibm-bob',
      baseUrl,
      model,
      apiKey,
      capabilities: this.capabilities,
    });
  }

  generate(input: AgentInput): Promise<AgentOutput> {
    return this.delegate.generate(input);
  }

  stream(input: AgentInput): AsyncIterable<AgentEvent> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.delegate.stream!(input);
  }
}

export function createIBMBobProvider(): IBMBobProvider {
  return new IBMBobProvider();
}
