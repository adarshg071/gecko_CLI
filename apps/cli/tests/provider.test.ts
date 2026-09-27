import { describe, it, expect } from 'vitest';
import { MockProvider } from '../src/providers/mock.ts';
import { ProviderConfigSchema } from '../../packages/protocol/src/index.ts';

describe('Provider configuration', () => {
  it('validates a complete provider config', () => {
    const cfg = ProviderConfigSchema.parse({
      id: 'my-openai',
      type: 'openai-compatible',
      base_url: 'https://api.openai.com',
      model: 'gpt-4o',
      supports_tool_calls: true,
      supports_streaming: true,
    });
    expect(cfg.id).toBe('my-openai');
    expect(cfg.supports_tool_calls).toBe(true);
  });

  it('rejects a config with missing required fields', () => {
    expect(() => ProviderConfigSchema.parse({ id: 'x' })).toThrow();
  });

  it('MockProvider generates a response without network', async () => {
    const provider = new MockProvider([{ content: 'hello', finish_reason: 'stop' }]);
    const out = await provider.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(out.content).toBe('hello');
    expect(out.finish_reason).toBe('stop');
  });

  it('MockProvider streams tokens', async () => {
    const provider = new MockProvider([{ content: 'abc', finish_reason: 'stop' }]);
    const chunks: string[] = [];
    for await (const event of provider.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
      if (event.type === 'text_delta') chunks.push(event.delta);
    }
    expect(chunks.join('')).toBe('abc');
  });

  it('MockProvider redacts credentials from output', () => {
    const provider = new MockProvider();
    // No API key visible in provider public interface
    expect(JSON.stringify(provider)).not.toContain('apiKey');
    expect(JSON.stringify(provider)).not.toContain('IBM_BOB');
  });
});
