import { GeminiProvider } from '../../../src/services/llm/GeminiProvider';
import { ClaudeProvider } from '../../../src/services/llm/ClaudeProvider';
import { OpenAIProvider } from '../../../src/services/llm/OpenAIProvider';

// Mocks
const mockGeminiChat = {
    sendMessage: jest.fn()
};
const mockGeminiModel = {
    startChat: jest.fn().mockReturnValue(mockGeminiChat)
};
const mockGoogleGenerativeAI = {
    getGenerativeModel: jest.fn().mockReturnValue(mockGeminiModel)
};

const mockAnthropicCreate = jest.fn();
const mockAnthropic = {
    messages: {
        create: mockAnthropicCreate
    }
};

const mockOpenAICreate = jest.fn();
const mockOpenAI = {
    chat: {
        completions: {
            create: mockOpenAICreate
        }
    }
};

// Mock modules
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn(() => mockGoogleGenerativeAI)
}));

jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn(() => mockAnthropic);
});

jest.mock('openai', () => {
    return jest.fn(() => mockOpenAI);
});

describe('LLM Providers', () => {
    const history = [{ role: 'user', content: 'Hello', timestamp: 123 }];
    const tools = [{ name: 'test-tool', description: 'desc', parameters: { type: 'object' } }];
    const prompt = 'User Prompt';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GeminiProvider', () => {
        it('should call Gemini API correctly', async () => {
            const provider = new GeminiProvider('fake-key');
            mockGeminiChat.sendMessage.mockResolvedValue({
                response: {
                    text: () => 'Gemini Response',
                    functionCalls: () => []
                }
            });

            const result = await provider.generateResponse(history as any, prompt, tools);

            expect(mockGeminiModel.startChat).toHaveBeenCalled();
            expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(prompt);
            expect(result.text).toBe('Gemini Response');
        });

        it('should handle tool calls', async () => {
            const provider = new GeminiProvider('fake-key');
            mockGeminiChat.sendMessage.mockResolvedValue({
                response: {
                    text: () => '',
                    functionCalls: () => [{ name: 'test_tool', args: {} }]
                }
            });

            const result = await provider.generateResponse(history as any, prompt, tools);
            expect(result.toolCalls).toHaveLength(1);
            expect(result.toolCalls![0].name).toBe('test_tool');
        });
    });

    describe('ClaudeProvider', () => {
        it('should call Anthropic API correctly', async () => {
            const provider = new ClaudeProvider('fake-key');
            mockAnthropicCreate.mockResolvedValue({
                content: [{ type: 'text', text: 'Claude Response' }]
            });

            const result = await provider.generateResponse(history as any, prompt, tools);

            expect(mockAnthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
                messages: expect.arrayContaining([{ role: 'user', content: prompt }]),
                tools: expect.any(Array)
            }));
            expect(result.text).toBe('Claude Response');
        });

        it('should handle tool use', async () => {
             const provider = new ClaudeProvider('fake-key');
             mockAnthropicCreate.mockResolvedValue({
                 content: [{ 
                     type: 'tool_use', 
                     id: 'call_1', 
                     name: 'test-tool', 
                     input: {} 
                 }]
             });
 
             const result = await provider.generateResponse(history as any, prompt, tools);
             expect(result.toolCalls).toHaveLength(1);
             expect(result.toolCalls![0].id).toBe('call_1');
        });
    });

    describe('OpenAIProvider', () => {
        it('should call OpenAI API correctly', async () => {
            const provider = new OpenAIProvider('fake-key');
            mockOpenAICreate.mockResolvedValue({
                choices: [{
                    message: {
                        content: 'GPT Response',
                        tool_calls: null
                    }
                }]
            });

            const result = await provider.generateResponse(history as any, prompt, tools);

            expect(mockOpenAICreate).toHaveBeenCalledWith(expect.objectContaining({
                model: 'gpt-4o',
                messages: expect.any(Array),
                tools: expect.any(Array)
            }));
            expect(result.text).toBe('GPT Response');
        });

        it('should handle tool calls', async () => {
            const provider = new OpenAIProvider('fake-key');
            mockOpenAICreate.mockResolvedValue({
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [{
                            id: 'call_1',
                            type: 'function',
                            function: {
                                name: 'test-tool',
                                arguments: '{}'
                            }
                        }]
                    }
                }]
            });

            const result = await provider.generateResponse(history as any, prompt, tools);
            expect(result.toolCalls).toHaveLength(1);
            expect(result.toolCalls![0].name).toBe('test-tool');
        });
    });
});
