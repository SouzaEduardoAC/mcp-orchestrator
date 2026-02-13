import { RedisClientType } from 'redis';
import { RedisFactory } from '../../infrastructure/cache/RedisFactory';
import { gzipSync, gunzipSync } from 'zlib';

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
  private readonly MAX_HISTORY = 50;
  private readonly ENABLE_COMPRESSION = process.env.ENABLE_CONVERSATION_COMPRESSION === 'true';

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
  }

  async getHistory(sessionId: string): Promise<Message[]> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    const raw = await client.lRange(key, 0, -1);

    return raw.map(item => {
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
  }

  async clearHistory(sessionId: string): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    await client.del(key);
  }
}
