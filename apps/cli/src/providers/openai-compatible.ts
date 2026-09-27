import {
  AgentProvider,
  AgentInput,
  AgentOutput,
  AgentEvent,
  ProviderCapabilities,
} from '../../../../packages/protocol/src/index.js';

/**
 * OpenAI-compatible HTTP provider adapter.
 * Works with any API that speaks the OpenAI Chat Completions protocol.
 */
export class OpenAICompatibleProvider implements AgentProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(opts: {
    id: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    capabilities?: Partial<ProviderCapabilities>;
  }) {
    this.id = opts.id;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.capabilities = {
      tool_calls: opts.capabilities?.tool_calls ?? true,
      streaming: opts.capabilities?.streaming ?? true,
      json_mode: opts.capabilities?.json_mode ?? true,
    };
  }

  async generate(input: AgentInput): Promise<AgentOutput> {
    const messages = this.buildMessages(input);
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) throw Object.assign(new Error('Rate limited'), { category: 'provider_rate_limit' });
      if (res.status >= 500) throw Object.assign(new Error(`Provider error: ${res.status}`), { category: 'provider_timeout' });
      throw new Error(`Provider request failed: ${res.status} — ${text}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message: { content: string | null; tool_calls?: Array<{ function: { name: string; arguments: string } }> };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    if (!choice) throw new Error('Provider returned no choices');

    return {
      content: choice.message.content ?? '',
      finish_reason: (choice.finish_reason as AgentOutput['finish_reason']) ?? 'stop',
      tool_calls: choice.message.tool_calls?.map((tc) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })),
      usage: data.usage,
    };
  }

  async *stream(input: AgentInput): AsyncIterable<AgentEvent> {
    const messages = this.buildMessages(input);
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Provider stream failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { yield { type: 'done', finish_reason: 'stop' }; return; }
        try {
          const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string }; finish_reason?: string }> };
          const delta = parsed.choices[0]?.delta;
          if (delta?.content) yield { type: 'text_delta', delta: delta.content };
          if (parsed.choices[0]?.finish_reason) yield { type: 'done', finish_reason: parsed.choices[0].finish_reason };
        } catch { /* skip malformed lines */ }
      }
    }
  }

  private buildMessages(input: AgentInput): Array<{ role: string; content: string }> {
    const msgs: Array<{ role: string; content: string }> = [];
    if (input.system_prompt) msgs.push({ role: 'system', content: input.system_prompt });
    if (input.task) {
      msgs.push({
        role: 'system',
        content: `Task: ${input.task.title}\nDescription: ${input.task.description}\nAcceptance criteria:\n${input.task.acceptance_criteria.join('\n')}`,
      });
    }
    msgs.push(...input.messages);
    return msgs;
  }
}
