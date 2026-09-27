import { AgentProvider, ProviderConfig, ProviderConfigSchema } from '../../../../packages/protocol/src/index.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { IBMBobProvider } from './ibm-bob.js';
import { MockProvider } from './mock.js';

export function buildProvider(config: ProviderConfig, apiKey: string): AgentProvider {
  switch (config.type) {
    case 'ibm-bob':
      return new IBMBobProvider();
    case 'mock':
      return new MockProvider();
    default:
      return new OpenAICompatibleProvider({
        id: config.id,
        baseUrl: config.base_url,
        model: config.model,
        apiKey,
        capabilities: {
          tool_calls: config.supports_tool_calls,
          streaming: config.supports_streaming,
          json_mode: true,
        },
      });
  }
}

export { ProviderConfigSchema };
export type { AgentProvider };
