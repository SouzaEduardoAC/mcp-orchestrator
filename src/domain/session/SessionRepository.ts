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
  getExpiredSessions(inactiveThresholdMs: number): Promise<string[]>;
  acquireLock(id: string, ttlMs: number): Promise<boolean>;
}

export class RedisSessionRepository implements SessionRepository {
  private redis: RedisClientType | null = null;
  private readonly PREFIX = 'mcp:session:';
  private readonly LOCK_PREFIX = 'mcp:lock:';
  private readonly INDEX_KEY = 'mcp:session:index'; // Sorted set by lastActive timestamp

  private async getRedis(): Promise<RedisClientType> {
    if (!this.redis) {
      this.redis = await RedisFactory.getInstance();
    }
    return this.redis;
  }

  async acquireLock(id: string, ttlMs: number): Promise<boolean> {
    const client = await this.getRedis();
    const lockKey = `${this.LOCK_PREFIX}${id}`;
    const result = await client.set(lockKey, 'locked', {
        NX: true,
        PX: ttlMs
    });
    return result === 'OK';
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
    // Use pipeline for atomic operations
    await client
      .multi()
      .set(key, JSON.stringify(data))
      .zAdd(this.INDEX_KEY, { score: now, value: id })
      .exec();
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
      const now = Date.now();
      session.lastActive = now;
      const client = await this.getRedis();
      const key = `${this.PREFIX}${id}`;
      // Use pipeline to update both session data and index atomically
      await client
        .multi()
        .set(key, JSON.stringify(session))
        .zAdd(this.INDEX_KEY, { score: now, value: id })
        .exec();
    }
  }

  async deleteSession(id: string): Promise<void> {
    const client = await this.getRedis();
    const key = `${this.PREFIX}${id}`;
    // Use pipeline to remove both session data and index entry atomically
    await client
      .multi()
      .del(key)
      .zRem(this.INDEX_KEY, id)
      .exec();
  }

  async getAllSessions(): Promise<string[]> {
    const client = await this.getRedis();
    const sessions: string[] = [];
    let cursor = '0';

    // Use SCAN instead of KEYS to avoid blocking Redis
    do {
      const result = await client.scan(cursor, {
        MATCH: `${this.PREFIX}*`,
        COUNT: 100
      });
      cursor = result.cursor;
      sessions.push(...result.keys.map(k => k.replace(this.PREFIX, '')));
    } while (cursor !== '0');

    return sessions;
  }

  /**
   * Get sessions that have been inactive for longer than the specified threshold.
   * Uses sorted set index for efficient queries.
   */
  async getExpiredSessions(inactiveThresholdMs: number): Promise<string[]> {
    const client = await this.getRedis();
    const cutoffTime = Date.now() - inactiveThresholdMs;

    // Query sorted set for sessions with lastActive < cutoffTime
    const expiredIds = await client.zRangeByScore(this.INDEX_KEY, 0, cutoffTime);
    return expiredIds;
  }
}
