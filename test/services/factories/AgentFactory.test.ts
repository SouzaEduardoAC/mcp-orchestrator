import { AgentFactory } from '../../../src/services/factories/AgentFactory';
import { GeminiProvider } from '../../../src/services/llm/GeminiProvider';
import { ClaudeProvider } from '../../../src/services/llm/ClaudeProvider';
import { OpenAIProvider } from '../../../src/services/llm/OpenAIProvider';
import { MCPAgent } from '../../../src/services/MCPAgent';

// Mocks
jest.mock('../../../src/services/llm/GeminiProvider');
jest.mock('../../../src/services/llm/ClaudeProvider');
jest.mock('../../../src/services/llm/OpenAIProvider');
jest.mock('../../../src/services/MCPAgent');

describe('AgentFactory', () => {
  const mockArgs: any = [
    'session-1',
    {},
    {},
    {},
    {}
  ];

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should create Gemini provider by default', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.LLM_PROVIDER;

    AgentFactory.createAgent.apply(null, mockArgs);

    expect(GeminiProvider).toHaveBeenCalledWith('test-key');
    expect(MCPAgent).toHaveBeenCalled();
  });

  it('should create Claude provider when LLM_PROVIDER is claude', () => {
    process.env.LLM_PROVIDER = 'claude';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    AgentFactory.createAgent.apply(null, mockArgs);

    expect(ClaudeProvider).toHaveBeenCalledWith('test-key');
  });

  it('should create OpenAI provider when LLM_PROVIDER is openai', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';

    AgentFactory.createAgent.apply(null, mockArgs);

    expect(OpenAIProvider).toHaveBeenCalledWith('test-key');
  });

  it('should throw if API key is missing', () => {
    process.env.LLM_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;

    expect(() => {
        AgentFactory.createAgent.apply(null, mockArgs);
    }).toThrow('GEMINI_API_KEY is required');
  });

  it('should accept client token override', () => {
      process.env.LLM_PROVIDER = 'gemini';
      delete process.env.GEMINI_API_KEY; // Ensure env is empty

      AgentFactory.createAgent('s1', {} as any, {} as any, {} as any, {} as any, 'client-key');

      expect(GeminiProvider).toHaveBeenCalledWith('client-key');
  });
});
