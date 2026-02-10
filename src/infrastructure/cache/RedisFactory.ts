import { createClient, RedisClientType } from 'redis';

export class RedisFactory {
  private static instance: RedisClientType;

  private constructor() {}

  public static async getInstance(): Promise<RedisClientType> {
    if (!RedisFactory.instance) {
      RedisFactory.instance = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      RedisFactory.instance.on('error', (err) => console.error('Redis Client Error', err));

      await RedisFactory.instance.connect();
    }
    return RedisFactory.instance;
  }

  public static async close(): Promise<void> {
      if (RedisFactory.instance) {
          await RedisFactory.instance.quit();
      }
  }
}
