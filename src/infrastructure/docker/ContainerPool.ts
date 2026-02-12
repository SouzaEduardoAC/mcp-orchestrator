import Docker from 'dockerode';
import { DockerClient } from './DockerClient';

interface PooledContainer {
  container: Docker.Container;
  id: string;
  acquiredAt?: number;
  lastUsedAt: number;
}

export interface ContainerPoolConfig {
  minPoolSize?: number;
  maxPoolSize?: number;
  idleTimeoutMs?: number;
  cleanupIntervalMs?: number;
  image: string;
  env: Record<string, string>;
  memory?: number;
  cpu?: number;
}

/**
 * Container pool for reusing Docker containers between sessions.
 * Reduces container acquisition time from 2-5s to <100ms.
 *
 * Benefits:
 * - Pre-warmed containers ready for immediate use
 * - Reduced Docker daemon load
 * - Faster user onboarding
 *
 * Trade-offs:
 * - Requires careful workspace cleanup
 * - Increased base resource usage (idle containers)
 * - Must ensure isolation between sessions
 */
export class ContainerPool {
  private idle: PooledContainer[] = [];
  private active: Map<string, PooledContainer> = new Map();
  private dockerClient: DockerClient;
  private config: Required<Omit<ContainerPoolConfig, 'memory' | 'cpu'>> & Pick<ContainerPoolConfig, 'memory' | 'cpu'>;
  private cleanupInterval?: NodeJS.Timeout;
  private warmupInProgress = false;

  private readonly MIN_POOL_SIZE = 10;
  private readonly MAX_POOL_SIZE = 100;
  private readonly IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

  constructor(dockerClient: DockerClient, config: ContainerPoolConfig) {
    this.dockerClient = dockerClient;
    this.config = {
      minPoolSize: config.minPoolSize || this.MIN_POOL_SIZE,
      maxPoolSize: config.maxPoolSize || this.MAX_POOL_SIZE,
      idleTimeoutMs: config.idleTimeoutMs || this.IDLE_TIMEOUT_MS,
      cleanupIntervalMs: config.cleanupIntervalMs || this.CLEANUP_INTERVAL_MS,
      image: config.image,
      env: config.env,
      memory: config.memory,
      cpu: config.cpu
    };
  }

  /**
   * Initialize the pool by pre-warming containers.
   */
  async initialize(): Promise<void> {
    console.log(`[ContainerPool] Initializing with min=${this.config.minPoolSize}, max=${this.config.maxPoolSize}`);

    // Pre-warm minimum number of containers
    await this.warmup();

    // Start periodic cleanup
    this.startCleanup();

    console.log(`[ContainerPool] Initialized with ${this.idle.length} idle containers`);
  }

  /**
   * Warm up the pool by creating minimum number of containers.
   */
  private async warmup(): Promise<void> {
    if (this.warmupInProgress) {
      return;
    }

    this.warmupInProgress = true;
    const needed = this.config.minPoolSize - this.idle.length;

    if (needed > 0) {
      console.log(`[ContainerPool] Warming up ${needed} containers...`);

      const promises: Promise<void>[] = [];
      for (let i = 0; i < needed; i++) {
        promises.push(this.createAndAddToPool());
      }

      await Promise.allSettled(promises);
    }

    this.warmupInProgress = false;
  }

  /**
   * Create a new container and add it to the idle pool.
   */
  private async createAndAddToPool(): Promise<void> {
    try {
      const container = await this.dockerClient.spawnContainer(
        this.config.image,
        this.config.env,
        undefined,
        this.config.memory,
        this.config.cpu
      );

      const pooled: PooledContainer = {
        container,
        id: container.id,
        lastUsedAt: Date.now()
      };

      this.idle.push(pooled);
      console.log(`[ContainerPool] Created container ${container.id.substring(0, 12)}, pool size: ${this.idle.length}`);
    } catch (error) {
      console.error('[ContainerPool] Failed to create container:', error);
      throw error;
    }
  }

  /**
   * Acquire a container from the pool.
   * Returns an idle container if available, otherwise creates a new one.
   */
  async acquire(sessionId: string): Promise<Docker.Container> {
    // Check if we have idle containers
    if (this.idle.length > 0) {
      const pooled = this.idle.pop()!;
      pooled.acquiredAt = Date.now();
      this.active.set(sessionId, pooled);

      console.log(`[ContainerPool] Acquired container ${pooled.id.substring(0, 12)} for session ${sessionId}, idle: ${this.idle.length}, active: ${this.active.size}`);

      // Trigger background warmup if needed
      this.warmupIfNeeded();

      return pooled.container;
    }

    // Check if we can create more containers
    const totalContainers = this.idle.length + this.active.size;
    if (totalContainers >= this.config.maxPoolSize) {
      throw new Error(`Container pool exhausted (max: ${this.config.maxPoolSize}). Please try again later.`);
    }

    // Create a new container
    console.log(`[ContainerPool] No idle containers, creating new one for session ${sessionId}`);
    const container = await this.dockerClient.spawnContainer(
      this.config.image,
      this.config.env,
      undefined,
      this.config.memory,
      this.config.cpu
    );

    const pooled: PooledContainer = {
      container,
      id: container.id,
      acquiredAt: Date.now(),
      lastUsedAt: Date.now()
    };

    this.active.set(sessionId, pooled);

    // Trigger background warmup
    this.warmupIfNeeded();

    return container;
  }

  /**
   * Release a container back to the pool after cleaning it.
   */
  async release(sessionId: string): Promise<void> {
    const pooled = this.active.get(sessionId);
    if (!pooled) {
      console.warn(`[ContainerPool] Attempted to release unknown session: ${sessionId}`);
      return;
    }

    this.active.delete(sessionId);

    try {
      // Clean the workspace
      await this.cleanupWorkspace(pooled.container);

      // Return to idle pool if under max size
      const totalContainers = this.idle.length + this.active.size;
      if (totalContainers < this.config.maxPoolSize) {
        pooled.lastUsedAt = Date.now();
        delete pooled.acquiredAt;
        this.idle.push(pooled);

        console.log(`[ContainerPool] Released container ${pooled.id.substring(0, 12)}, idle: ${this.idle.length}, active: ${this.active.size}`);
      } else {
        // Pool is full, destroy the container
        await this.destroyContainer(pooled);
      }
    } catch (error) {
      console.error(`[ContainerPool] Error releasing container ${pooled.id.substring(0, 12)}:`, error);
      // On cleanup failure, destroy the container
      await this.destroyContainer(pooled);
    }
  }

  /**
   * Clean the workspace directory in the container.
   * Removes all files to ensure isolation between sessions.
   */
  private async cleanupWorkspace(container: Docker.Container): Promise<void> {
    try {
      // Execute cleanup command in container
      const exec = await container.exec({
        Cmd: ['sh', '-c', 'rm -rf /workspace/* /workspace/.[!.]* 2>/dev/null || true'],
        AttachStdout: false,
        AttachStderr: false
      });

      await exec.start({ Detach: true });

      // Wait a bit for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('[ContainerPool] Workspace cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Destroy a container and remove it from the pool.
   */
  private async destroyContainer(pooled: PooledContainer): Promise<void> {
    try {
      await this.dockerClient.stopContainer(pooled.id);
      console.log(`[ContainerPool] Destroyed container ${pooled.id.substring(0, 12)}`);
    } catch (error) {
      console.error(`[ContainerPool] Failed to destroy container ${pooled.id.substring(0, 12)}:`, error);
    }
  }

  /**
   * Trigger background warmup if idle pool is below minimum.
   */
  private warmupIfNeeded(): void {
    if (this.idle.length < this.config.minPoolSize && !this.warmupInProgress) {
      // Don't await - run in background
      this.warmup().catch(err => {
        console.error('[ContainerPool] Background warmup failed:', err);
      });
    }
  }

  /**
   * Start periodic cleanup of idle containers that have exceeded timeout.
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleContainers().catch(err => {
        console.error('[ContainerPool] Cleanup cycle failed:', err);
      });
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Clean up idle containers that have exceeded the idle timeout.
   */
  private async cleanupIdleContainers(): Promise<void> {
    const now = Date.now();
    const toRemove: PooledContainer[] = [];

    // Find containers that have been idle too long
    for (let i = this.idle.length - 1; i >= 0; i--) {
      const pooled = this.idle[i];
      if (now - pooled.lastUsedAt > this.config.idleTimeoutMs) {
        // Keep minimum pool size
        if (this.idle.length - toRemove.length > this.config.minPoolSize) {
          toRemove.push(pooled);
          this.idle.splice(i, 1);
        }
      }
    }

    if (toRemove.length > 0) {
      console.log(`[ContainerPool] Cleaning up ${toRemove.length} idle containers`);

      await Promise.allSettled(
        toRemove.map(pooled => this.destroyContainer(pooled))
      );
    }
  }

  /**
   * Shutdown the pool and clean up all containers.
   */
  async shutdown(): Promise<void> {
    console.log('[ContainerPool] Shutting down...');

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Destroy all idle containers
    const idlePromises = this.idle.map(pooled => this.destroyContainer(pooled));

    // Destroy all active containers
    const activePromises = Array.from(this.active.values()).map(pooled => this.destroyContainer(pooled));

    await Promise.allSettled([...idlePromises, ...activePromises]);

    this.idle = [];
    this.active.clear();

    console.log('[ContainerPool] Shutdown complete');
  }

  /**
   * Get pool statistics for monitoring.
   */
  getStats(): {
    idle: number;
    active: number;
    total: number;
    maxPoolSize: number;
    minPoolSize: number;
  } {
    return {
      idle: this.idle.length,
      active: this.active.size,
      total: this.idle.length + this.active.size,
      maxPoolSize: this.config.maxPoolSize,
      minPoolSize: this.config.minPoolSize
    };
  }
}
