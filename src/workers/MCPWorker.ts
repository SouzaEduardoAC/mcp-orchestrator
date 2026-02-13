import { MessageQueue, ToolJob, ToolJobResult } from '../services/MessageQueue';
import { DockerClient } from '../infrastructure/docker/DockerClient';
import { SessionRepository } from '../domain/session/SessionRepository';

/**
 * MCP Worker - Dedicated process for executing MCP tool calls.
 *
 * Architecture:
 * - Runs as separate process/container from orchestrator
 * - Consumes jobs from Redis queue
 * - Executes tools in Docker containers
 * - Publishes results back via Redis pub/sub
 *
 * Benefits:
 * - Orchestrator becomes stateless API gateway
 * - Workers can scale independently (10-100 workers)
 * - Better resource isolation
 * - Fault tolerance (worker crash doesn't affect orchestrator)
 */
export class MCPWorker {
  private running = false;
  private readonly concurrency: number;
  private activeJobs = 0;

  constructor(
    private messageQueue: MessageQueue,
    private dockerClient: DockerClient,
    private sessionRepository: SessionRepository,
    concurrency: number = 10
  ) {
    this.concurrency = concurrency;
  }

  /**
   * Start the worker process.
   * Continuously polls for jobs and executes them.
   */
  async start(): Promise<void> {
    this.running = true;
    console.log(`[MCPWorker] Starting with concurrency=${this.concurrency}`);

    // Start multiple concurrent job processors
    const processors: Promise<void>[] = [];
    for (let i = 0; i < this.concurrency; i++) {
      processors.push(this.processJobs(i));
    }

    // Wait for all processors to finish (when stopped)
    await Promise.all(processors);
  }

  /**
   * Stop the worker process.
   */
  async stop(): Promise<void> {
    console.log('[MCPWorker] Stopping...');
    this.running = false;

    // Wait for active jobs to complete
    while (this.activeJobs > 0) {
      console.log(`[MCPWorker] Waiting for ${this.activeJobs} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[MCPWorker] Stopped');
  }

  /**
   * Process jobs continuously.
   */
  private async processJobs(workerId: number): Promise<void> {
    console.log(`[MCPWorker ${workerId}] Started`);

    while (this.running) {
      try {
        // Dequeue job with 5 second timeout
        const job = await this.messageQueue.dequeueJob(5);

        if (!job) {
          // No job available, continue polling
          continue;
        }

        this.activeJobs++;
        await this.executeJob(workerId, job);
        this.activeJobs--;

      } catch (error) {
        console.error(`[MCPWorker ${workerId}] Error processing job:`, error);
        // Continue processing even if one job fails
      }
    }

    console.log(`[MCPWorker ${workerId}] Stopped`);
  }

  /**
   * Execute a single job.
   */
  private async executeJob(workerId: number, job: ToolJob): Promise<void> {
    console.log(`[MCPWorker ${workerId}] Executing job ${job.jobId}: ${job.toolName}`);

    try {
      // Get session data
      const session = await this.sessionRepository.getSession(job.sessionId);

      if (!session) {
        throw new Error(`Session ${job.sessionId} not found`);
      }

      // Get container
      const container = this.dockerClient.getContainer(session.containerId);

      // Execute tool in container
      const result = await this.executeToolInContainer(container, job);

      // Publish success result
      await this.messageQueue.publishResult({
        jobId: job.jobId,
        sessionId: job.sessionId,
        callId: job.callId,
        success: true,
        output: result,
        timestamp: Date.now()
      });

      console.log(`[MCPWorker ${workerId}] Completed job ${job.jobId}`);

    } catch (error: any) {
      console.error(`[MCPWorker ${workerId}] Failed job ${job.jobId}:`, error);

      // Publish error result
      await this.messageQueue.publishResult({
        jobId: job.jobId,
        sessionId: job.sessionId,
        callId: job.callId,
        success: false,
        error: error.message || 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Execute tool in Docker container.
   * This is a simplified version - actual implementation would use MCP protocol.
   */
  private async executeToolInContainer(container: any, job: ToolJob): Promise<any> {
    // TODO: Implement actual MCP tool execution
    // This would involve:
    // 1. Attach to container stdin/stdout
    // 2. Send JSON-RPC request for tool execution
    // 3. Wait for response
    // 4. Parse and return result

    // Placeholder implementation
    return {
      tool: job.toolName,
      args: job.args,
      executed_at: new Date().toISOString()
    };
  }

  /**
   * Get worker statistics.
   */
  getStats(): {
    running: boolean;
    activeJobs: number;
    concurrency: number;
  } {
    return {
      running: this.running,
      activeJobs: this.activeJobs,
      concurrency: this.concurrency
    };
  }
}
