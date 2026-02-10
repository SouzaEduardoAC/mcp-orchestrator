import { RedisClientType } from 'redis';
import { RedisFactory } from '../../infrastructure/cache/RedisFactory';

export interface SessionData {
  containerId: string;
  startTime: number;
  lastActive: number;
}

export interface SessionRepository {
  saveSession(id: string, containerId: string): Promise<void>;
  getSession(id: string): Promise<SessionData | null>;
  updateHeartbeat(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  getAllSessions(): Promise<string[]>; 
}

export class RedisSessionRepository implements SessionRepository {
  private redis: RedisClientType | null = null;
  private readonly PREFIX = 'mcp:session:';

  private async getRedis(): Promise<RedisClientType> {
    if (!this.redis) {
      this.redis = await RedisFactory.getInstance();
    }
    return this.redis;
  }

  async saveSession(id: string, containerId: string): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${id}`;
    const now = Date.now();
    const data: SessionData = {
      containerId,
      startTime: now,
      lastActive: now,
    };
    await client.set(key, JSON.stringify(data));
  }

  async getSession(id: string): Promise<SessionData | null> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${id}`;
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }

  async updateHeartbeat(id: string): Promise<void> {
    const session = await this.getSession(id);
    if (session) {
      session.lastActive = Date.now();
      const client = await this.getRedis();
      const key = `${this.PREFIX}${id}`;
      await client.set(key, JSON.stringify(session));
    }
  }

  async deleteSession(id: string): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${id}`;
    await client.del(key);
  }

  async getAllSessions(): Promise<string[]> {
      const client = await this.getRedis();
      const keys = await client.keys(`${this.PREFIX}*`);
      return keys.map(k => k.replace(this.PREFIX, ''));
  }
}
