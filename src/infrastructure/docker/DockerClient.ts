import Docker from 'dockerode';

interface QueuedOperation<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  retries: number;
}

export class DockerClient {
  private docker: Docker;
  private concurrentOps = 0;
  private readonly MAX_CONCURRENT_OPS = 20; // Docker daemon throughput limit
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY_MS = 1000;
  private operationQueue: QueuedOperation<any>[] = [];

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Execute an operation with circuit breaker pattern.
   * Limits concurrent operations and implements exponential backoff.
   */
  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    retries = 0
  ): Promise<T> {
    // Check if we're at capacity
    if (this.concurrentOps >= this.MAX_CONCURRENT_OPS) {
      // Check queue size
      if (this.operationQueue.length >= this.MAX_QUEUE_SIZE) {
        throw new Error('Docker operation queue full. Service temporarily unavailable.');
      }

      // Queue the operation
      return new Promise<T>((resolve, reject) => {
        this.operationQueue.push({ execute: operation, resolve, reject, retries });
      });
    }

    // Execute immediately
    this.concurrentOps++;
    try {
      const result = await operation();
      return result;
    } catch (error: any) {
      // Implement exponential backoff for retryable errors
      if (retries < this.MAX_RETRIES && this.isRetryableError(error)) {
        const delay = this.BASE_RETRY_DELAY_MS * Math.pow(2, retries);
        console.warn(`[DockerClient] Operation failed, retrying in ${delay}ms (attempt ${retries + 1}/${this.MAX_RETRIES})`, error.message);
        await this.sleep(delay);
        return this.executeWithCircuitBreaker(operation, retries + 1);
      }
      throw error;
    } finally {
      this.concurrentOps--;
      this.processQueue();
    }
  }

  /**
   * Process queued operations when capacity becomes available.
   */
  private processQueue(): void {
    if (this.operationQueue.length === 0 || this.concurrentOps >= this.MAX_CONCURRENT_OPS) {
      return;
    }

    const queued = this.operationQueue.shift();
    if (queued) {
      this.executeWithCircuitBreaker(queued.execute, queued.retries)
        .then(queued.resolve)
        .catch(queued.reject);
    }
  }

  /**
   * Check if an error is retryable.
   */
  private isRetryableError(error: any): boolean {
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    return retryableStatusCodes.includes(error.statusCode) ||
           error.message?.includes('timeout') ||
           error.message?.includes('ECONNREFUSED');
  }

  /**
   * Sleep utility for exponential backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Spawns a new Docker container with the specified image and environment variables.
   * The container is configured with Tty: false, OpenStdin: true, and attached streams.
   *
   * @param image The Docker image to use.
   * @param env Key-value pairs of environment variables.
   * @param cmd Optional command to run in the container.
   * @param memory Optional memory limit in MB (default: 512MB).
   * @param cpu Optional CPU limit (default: 0.5 cores).
   * @returns The started Docker container instance.
   */
  async spawnContainer(
    image: string,
    env: Record<string, string>,
    cmd?: string[],
    memory?: number,
    cpu?: number
  ): Promise<Docker.Container> {
    return this.executeWithCircuitBreaker(async () => {
      const envArray = Object.entries(env).map(([key, value]) => `${key}=${value}`);

      const container = await this.docker.createContainer({
        Image: image,
        Env: envArray,
        Cmd: cmd,
        Tty: false,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
            Memory: (memory || 512) * 1024 * 1024, // Default 512MB
            NanoCpus: ((cpu || 0.5) * 1000000000), // Default 0.5 CPU
            NetworkMode: 'none'                     // Disable networking
        }
      });

      await container.start();
      return container;
    });
  }
  
  /**
   * Helper to pull an image. specific for setup/testing.
   */
  async pullImage(image: string): Promise<void> {
      // Stream handling for pull is complex in dockerode, doing a basic follow
      await new Promise<void>((resolve, reject) => {
          this.docker.pull(image, (err: any, stream: any) => {
              if (err) return reject(err);
              this.docker.modem.followProgress(stream, onFinished, onProgress);

              function onFinished(err: any, output: any) {
                  if (err) return reject(err);
                  resolve();
              }
              function onProgress(event: any) {
                  // silent
              }
          });
      });
  }

  /**
   * Stops and removes a container by ID.
   * @param containerId The ID of the container to stop.
   */
  async stopContainer(containerId: string): Promise<void> {
    return this.executeWithCircuitBreaker(async () => {
      const container = this.docker.getContainer(containerId);
      try {
          await container.stop();
      } catch (e: any) {
          // Ignore if already stopped (304) or not found (404)
          if (e.statusCode !== 304 && e.statusCode !== 404) throw e;
      }
      try {
          await container.remove();
      } catch (e: any) {
           if (e.statusCode !== 404) throw e;
      }
    });
  }

  getContainer(containerId: string): Docker.Container {
      return this.docker.getContainer(containerId);
  }
}
