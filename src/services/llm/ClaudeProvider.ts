import Anthropic from '@anthropic-ai/sdk';
import { Message } from '../../domain/conversation/ConversationRepository';
import { LLMProvider, LLMResult, ToolDefinition } from '../../interfaces/llm/LLMProvider';

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-sonnet-4-5-20250929';
  }

  async generateResponse(
    history: Message[], 
    userPrompt: string, 
    tools: ToolDefinition[]
  ): Promise<LLMResult> {
    const claudeTools: Anthropic.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description || '',
      input_schema: t.parameters
    }));

    const messages: Anthropic.MessageParam[] = history
      .filter(h => h.role !== 'tool') // Simplified history for now
      .map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      }));

    messages.push({ role: 'user', content: userPrompt });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages,
      tools: claudeTools.length > 0 ? claudeTools : undefined
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as Anthropic.TextBlock).text)
      .join('\n');

    const toolCalls = response.content
      .filter(c => c.type === 'tool_use')
      .map(c => {
        const toolUse = c as Anthropic.ToolUseBlock;
        return {
          id: toolUse.id,
          name: toolUse.name,
          args: toolUse.input
        };
      });

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}
