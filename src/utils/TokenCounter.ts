import { Message } from '../domain/conversation/ConversationRepository';

/**
 * Token counting utility for managing conversation history within LLM token limits.
 *
 * Uses character-based heuristic for fast approximation:
 * - 1 token ≈ 4 characters for English text
 * - More accurate than message count
 * - Faster than tiktoken library
 * - Good enough for history management
 */
export class TokenCounter {
  /**
   * Approximate token count using character-based heuristic.
   * Rule of thumb: 1 token ≈ 4 characters for English text.
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total tokens in conversation history.
   * Includes message content, tool calls, and tool responses.
   */
  static countHistoryTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      // Count main content
      total += this.estimateTokens(msg.content);

      // Tool calls add tokens
      if (msg.toolCalls) {
        total += this.estimateTokens(JSON.stringify(msg.toolCalls));
      }

      // Tool responses add tokens
      if (msg.toolResponse) {
        total += this.estimateTokens(JSON.stringify(msg.toolResponse));
      }
    }
    return total;
  }

  /**
   * Calculate tokens for a single message.
   */
  static countMessageTokens(message: Message): number {
    let total = this.estimateTokens(message.content);

    if (message.toolCalls) {
      total += this.estimateTokens(JSON.stringify(message.toolCalls));
    }

    if (message.toolResponse) {
      total += this.estimateTokens(JSON.stringify(message.toolResponse));
    }

    return total;
  }
}
