/**
 * Mock provider for tests. Never makes network requests.
 */
import {
  AgentProvider,
  AgentInput,
  AgentOutput,
  AgentEvent,
  ProviderCapabilities,
} from '../../../../packages/protocol/src/index.js';

export class MockProvider implements AgentProvider {
  readonly id = 'mock';
  readonly capabilities: ProviderCapabilities = {
    tool_calls: true,
    streaming: true,
    json_mode: true,
  };

  private responses: AgentOutput[];
  private callIndex = 0;

  constructor(responses?: AgentOutput[]) {
    this.responses = responses ?? [
      {
        content: JSON.stringify({ goal: 'Test', tasks: [] }),
        finish_reason: 'stop',
      },
    ];
  }

  generate(_input: AgentInput): Promise<AgentOutput> {
    const res = this.responses[this.callIndex % this.responses.length];
    this.callIndex++;
    if (!res) throw new Error('MockProvider: no response configured');
    return Promise.resolve(res);
  }

  async *stream(_input: AgentInput): AsyncIterable<AgentEvent> {
    const res = await this.generate(_input);
    for (const char of res.content) {
      yield { type: 'text_delta', delta: char };
    }
    yield { type: 'done', finish_reason: res.finish_reason };
  }
}
