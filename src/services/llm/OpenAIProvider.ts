import OpenAI from 'openai';
import { Message } from '../../domain/conversation/ConversationRepository';
import { LLMProvider, LLMResult, ToolDefinition } from '../../interfaces/llm/LLMProvider';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateResponse(
    history: Message[], 
    userPrompt: string, 
    tools: ToolDefinition[]
  ): Promise<LLMResult> {
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = history
      .filter(h => h.role !== 'tool') // Simplified history
      .map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      }));

    messages.push({ role: 'user', content: userPrompt });

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined
    });

    const choice = response.choices[0];
    const text = choice.message.content || '';
    const toolCalls = choice.message.tool_calls?.map(tc => {
      if (tc.type === 'function') {
        return {
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments)
        };
      }
      return undefined;
    }).filter(tc => tc !== undefined);

    return {
      text,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls as any : undefined
    };
  }
}
