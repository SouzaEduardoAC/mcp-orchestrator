import { Message } from '../../domain/conversation/ConversationRepository';

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters: any; // JSON Schema
}

export interface ToolCall {
  id?: string; // Some providers (OpenAI/Claude) have specific IDs
  name: string;
  args: any;
}

export interface LLMResult {
  text: string;
  toolCalls?: ToolCall[];
}

export interface LLMProvider {
  generateResponse(
    history: Message[], 
    userPrompt: string, 
    tools: ToolDefinition[]
  ): Promise<LLMResult>;
}
