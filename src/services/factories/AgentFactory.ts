import { ConversationRepository } from '../../domain/conversation/ConversationRepository';
import { DockerClient } from '../../infrastructure/docker/DockerClient';
import { SessionData } from '../../domain/session/SessionRepository';
import { MCPAgent, AgentEvents } from '../MCPAgent';
import { GeminiProvider } from '../llm/GeminiProvider';
import { ClaudeProvider } from '../llm/ClaudeProvider';
import { OpenAIProvider } from '../llm/OpenAIProvider';
import { LLMProvider } from '../../interfaces/llm/LLMProvider';

export class AgentFactory {
  static createAgent(
    sessionId: string,
    sessionData: SessionData,
    conversationRepo: ConversationRepository,
    dockerClient: DockerClient,
    events: AgentEvents,
    clientToken?: string,
    modelName?: string
  ): MCPAgent {
    const providerType = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

    let provider: LLMProvider;

    switch (providerType) {
      case 'claude':
      case 'anthropic':
        const claudeKey = clientToken || process.env.ANTHROPIC_API_KEY;
        if (!claudeKey) throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
        provider = new ClaudeProvider(claudeKey, modelName);
        break;

      case 'openai':
      case 'chatgpt':
        const openaiKey = clientToken || process.env.OPENAI_API_KEY;
        if (!openaiKey) throw new Error('OPENAI_API_KEY is required for OpenAI provider');
        provider = new OpenAIProvider(openaiKey, modelName);
        break;

      case 'gemini':
      case 'google':
      default:
        const geminiKey = clientToken || process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY is required for Gemini provider');
        provider = new GeminiProvider(geminiKey, modelName);
        break;
    }

    return new MCPAgent(
      provider,
      sessionId,
      sessionData,
      conversationRepo,
      dockerClient,
      events
    );
  }

  static getProviderType(): string {
    return (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  }
}
