import { RedisClientType } from 'redis';
import { RedisFactory } from '../infrastructure/cache/RedisFactory';

/**
 * Job payload for MCP tool execution
 */
export interface ToolJob {
  jobId: string;
  sessionId: string;
  toolName: string;
  args: any;
  callId: string;
  timestamp: number;
}

/**
 * Job result from MCP tool execution
 */
export interface ToolJobResult {
  jobId: string;
  sessionId: string;
  callId: string;
  success: boolean;
  output?: any;
  error?: string;
  timestamp: number;
}

/**
 * Message queue for decoupling tool execution from orchestrator.
 *
 * Architecture:
 * - Orchestrator enqueues tool execution jobs
 * - Worker processes dequeue and execute jobs
 * - Results are published back to orchestrator via pub/sub
 *
 * Benefits:
 * - Orchestrator becomes stateless
 * - Workers can scale independently
 * - Better resource isolation
 * - Improved fault tolerance
 */
export class MessageQueue {
  private redis: RedisClientType | null = null;
  private readonly JOB_QUEUE_KEY = 'mcp:jobs:queue';
  private readonly RESULT_CHANNEL_PREFIX = 'mcp:results:';
  private readonly JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  private async getRedis(): Promise<RedisClientType> {
    if (!this.redis) {
      this.redis = await RedisFactory.getInstance();
    }
    return this.redis;
  }

  /**
   * Enqueue a tool execution job.
   * Jobs are added to a Redis list for FIFO processing.
   */
  async enqueueJob(job: ToolJob): Promise<void> {
    const client = await this.getRedis();
    const jobData = JSON.stringify(job);

    // Add job to queue (left push for FIFO with right pop)
    await client.lPush(this.JOB_QUEUE_KEY, jobData);

    console.log(`[MessageQueue] Enqueued job ${job.jobId} for tool ${job.toolName}`);
  }

  /**
   * Dequeue a tool execution job (blocking operation).
   * Used by worker processes to get jobs to execute.
   *
   * @param timeoutSeconds Maximum time to wait for a job (0 = wait forever)
   * @returns Job or null if timeout
   */
  async dequeueJob(timeoutSeconds: number = 5): Promise<ToolJob | null> {
    const client = await this.getRedis();

    // Blocking right pop (BRPOP) - waits for a job
    const result = await client.brPop(this.JOB_QUEUE_KEY, timeoutSeconds);

    if (!result) {
      return null;
    }

    const job: ToolJob = JSON.parse(result.element);

    // Check if job has expired
    const age = Date.now() - job.timestamp;
    if (age > this.JOB_TIMEOUT_MS) {
      console.warn(`[MessageQueue] Job ${job.jobId} expired (age: ${age}ms)`);

      // Publish timeout error
      await this.publishResult({
        jobId: job.jobId,
        sessionId: job.sessionId,
        callId: job.callId,
        success: false,
        error: 'Job timeout - exceeded maximum execution time',
        timestamp: Date.now()
      });

      return null;
    }

    console.log(`[MessageQueue] Dequeued job ${job.jobId} for tool ${job.toolName}`);
    return job;
  }

  /**
   * Publish a job result back to the orchestrator.
   * Uses Redis pub/sub for real-time delivery.
   */
  async publishResult(result: ToolJobResult): Promise<void> {
    const client = await this.getRedis();
    const channel = `${this.RESULT_CHANNEL_PREFIX}${result.sessionId}`;
    const resultData = JSON.stringify(result);

    await client.publish(channel, resultData);

    console.log(`[MessageQueue] Published result for job ${result.jobId} to channel ${channel}`);
  }

  /**
   * Subscribe to job results for a specific session.
   * Used by orchestrator to receive worker results.
   */
  async subscribeToResults(
    sessionId: string,
    callback: (result: ToolJobResult) => void
  ): Promise<() => Promise<void>> {
    const client = await this.getRedis();
    const channel = `${this.RESULT_CHANNEL_PREFIX}${sessionId}`;

    // Create a duplicate connection for pub/sub (Redis requirement)
    const subscriber = client.duplicate();
    await subscriber.connect();

    await subscriber.subscribe(channel, (message) => {
      try {
        const result: ToolJobResult = JSON.parse(message);
        callback(result);
      } catch (error) {
        console.error(`[MessageQueue] Error parsing result:`, error);
      }
    });

    console.log(`[MessageQueue] Subscribed to results for session ${sessionId}`);

    // Return unsubscribe function
    return async () => {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
      console.log(`[MessageQueue] Unsubscribed from session ${sessionId}`);
    };
  }

  /**
   * Get queue depth for monitoring.
   */
  async getQueueDepth(): Promise<number> {
    const client = await this.getRedis();
    return await client.lLen(this.JOB_QUEUE_KEY);
  }

  /**
   * Get queue statistics.
   */
  async getStats(): Promise<{
    queueDepth: number;
    timestamp: number;
  }> {
    return {
      queueDepth: await this.getQueueDepth(),
      timestamp: Date.now()
    };
  }

  /**
   * Clear all jobs from the queue (for testing/maintenance).
   */
  async clearQueue(): Promise<number> {
    const client = await this.getRedis();
    const count = await client.del(this.JOB_QUEUE_KEY);
    console.log(`[MessageQueue] Cleared ${count} jobs from queue`);
    return count;
  }
}
