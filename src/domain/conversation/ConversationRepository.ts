import { RedisClientType } from 'redis';
import { RedisFactory } from '../../infrastructure/cache/RedisFactory';
import { gzipSync, gunzipSync } from 'zlib';
import { TokenCounter } from '../../utils/TokenCounter';

export interface Message {
  role: 'user' | 'model' | 'tool';
  content: string;
  toolCalls?: any[]; // Simplified for prototype
  toolResponse?: any; // Simplified for prototype
  timestamp: number;
}

export interface ConversationRepository {
  addMessage(sessionId: string, message: Message): Promise<void>;
  getHistory(sessionId: string): Promise<Message[]>;
  clearHistory(sessionId: string): Promise<void>;
}

export class RedisConversationRepository implements ConversationRepository {
  private redis: RedisClientType | null = null;
  private readonly PREFIX = 'mcp:conversation:';
  private readonly MAX_HISTORY = 50; // Fallback message count limit
  private readonly ENABLE_COMPRESSION = process.env.ENABLE_CONVERSATION_COMPRESSION === 'true';
  private readonly HISTORY_TTL_SECONDS = parseInt(
    process.env.HISTORY_TTL_SECONDS || '86400'
  ); // Default: 24 hours
  private readonly MAX_HISTORY_TOKENS = parseInt(
    process.env.MAX_HISTORY_TOKENS || '30000'
  ); // Default: 30k tokens (leaves room for tool definitions)

  private async getRedis(): Promise<RedisClientType> {
    if (!this.redis) {
      this.redis = await RedisFactory.getInstance();
    }
    return this.redis;
  }

  /**
   * Compress data using gzip.
   * Reduces memory usage by 60-80% for conversation history.
   */
  private compress(data: string): Buffer {
    return gzipSync(Buffer.from(data, 'utf-8'));
  }

  /**
   * Decompress gzip data.
   */
  private decompress(data: Buffer): string {
    return gunzipSync(data).toString('utf-8');
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    const serialized = JSON.stringify(message);

    if (this.ENABLE_COMPRESSION) {
      // Store compressed data as buffer
      const compressed = this.compress(serialized);
      await client.rPush(key, compressed);
    } else {
      // Store uncompressed
      await client.rPush(key, serialized);
    }

    // Sliding window
    await client.lTrim(key, -this.MAX_HISTORY, -1);

    // Set TTL: Conversation expires after configured time of inactivity (default: 24 hours)
    // This provides a safety net for orphaned keys
    await client.expire(key, this.HISTORY_TTL_SECONDS);
  }

  /**
   * Get history with token-aware truncation.
   * Returns messages that fit within the configured token limit.
   */
  async getHistory(sessionId: string): Promise<Message[]> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    const raw = await client.lRange(key, 0, -1);

    const messages = raw.map(item => {
      let data: string;

      if (this.ENABLE_COMPRESSION) {
        // Try to decompress, fallback to plain if it fails (mixed data)
        try {
          data = typeof item === 'string'
            ? item  // Plain string (not compressed)
            : this.decompress(Buffer.from(item as any));
        } catch (e) {
          // Assume it's plain JSON
          data = item as string;
        }
      } else {
        data = item as string;
      }

      return JSON.parse(data) as Message;
    });

    // Truncate based on token count, not just message count
    return this.truncateByTokens(messages);
  }

  /**
   * Truncate messages to stay within token budget.
   * Keeps most recent messages that fit within limit.
   */
  private truncateByTokens(messages: Message[]): Message[] {
    let totalTokens = TokenCounter.countHistoryTokens(messages);

    // If within limit, return all
    if (totalTokens <= this.MAX_HISTORY_TOKENS) {
      return messages;
    }

    console.warn(
      `[ConversationRepo] History exceeds token limit: ${totalTokens} > ${this.MAX_HISTORY_TOKENS}. Truncating...`
    );

    // Keep most recent messages that fit
    const result: Message[] = [];
    totalTokens = 0;

    // Iterate from newest to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = TokenCounter.countMessageTokens(msg);

      if (totalTokens + msgTokens <= this.MAX_HISTORY_TOKENS) {
        result.unshift(msg); // Add to beginning
        totalTokens += msgTokens;
      } else {
        // Can't fit more messages
        break;
      }
    }

    console.log(
      `[ConversationRepo] Truncated to ${result.length} messages (${totalTokens} tokens)`
    );

    return result;
  }

  async clearHistory(sessionId: string): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    await client.del(key);
  }
}
