import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Message } from '../../domain/conversation/ConversationRepository';
import { LLMProvider, LLMResult, ToolDefinition } from '../../interfaces/llm/LLMProvider';

export class GeminiProvider implements LLMProvider {
  private model: GenerativeModel;

  constructor(apiKey: string, modelName?: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: modelName || 'gemini-2.0-flash-exp' });
  }

  async generateResponse(
    history: Message[], 
    userPrompt: string, 
    tools: ToolDefinition[]
  ): Promise<LLMResult> {
    const geminiTools = tools.length > 0 ? [{
      functionDeclarations: tools.map(t => ({
        name: t.name.replace(/-/g, '_'), // Gemini strict naming
        description: t.description || '',
        parameters: t.parameters as any
      }))
    }] : undefined;

    // Filter tool messages for simple text history first as per original logic
    // In a real app, we'd use proper tool response parts
    const chat = this.model.startChat({
      history: history.filter(h => h.role !== 'tool').map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      tools: geminiTools
    });

    const result = await chat.sendMessage(userPrompt);
    const response = result.response;
    const text = response.text();
    const calls = response.functionCalls();

    const toolCalls = calls?.map(call => ({
      name: call.name,
      args: call.args
    }));

    return {
      text,
      toolCalls
    };
  }
}
