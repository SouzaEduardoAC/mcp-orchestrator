import { RedisClientType } from 'redis';
import { RedisFactory } from '../../infrastructure/cache/RedisFactory';

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

  private async getRedis(): Promise<RedisClientType> {
    if (!this.redis) {
      this.redis = await RedisFactory.getInstance();
    }
    return this.redis;
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    await client.rPush(key, JSON.stringify(message));
    // Sliding window
    await client.lTrim(key, -this.MAX_HISTORY, -1);
  }

  async getHistory(sessionId: string): Promise<Message[]> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    const raw = await client.lRange(key, 0, -1);
    return raw.map(item => JSON.parse(item) as Message);
  }

  async clearHistory(sessionId: string): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${sessionId}`;
    await client.del(key);
  }
}
