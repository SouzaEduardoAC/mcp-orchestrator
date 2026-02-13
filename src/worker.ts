import 'dotenv/config';
import { MCPWorker } from './workers/MCPWorker';
import { MessageQueue } from './services/MessageQueue';
import { DockerClient } from './infrastructure/docker/DockerClient';
import { RedisSessionRepository } from './domain/session/SessionRepository';
import { RedisFactory } from './infrastructure/cache/RedisFactory';

/**
 * Worker Process Entry Point
 *
 * This is a separate process from the main orchestrator that executes MCP tools.
 * Multiple workers can run in parallel for horizontal scaling.
 *
 * Usage:
 *   node dist/worker.js
 *
 * Environment Variables:
 *   WORKER_CONCURRENCY - Number of concurrent jobs per worker (default: 10)
 *   REDIS_URL - Redis connection string
 */
async function bootstrap() {
  console.log('Starting MCP Worker...');

  // 1. Infrastructure
  await RedisFactory.getInstance();
  const dockerClient = new DockerClient();
  const sessionRepository = new RedisSessionRepository();
  const messageQueue = new MessageQueue();

  // 2. Worker Configuration
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '10');

  // 3. Create Worker
  const worker = new MCPWorker(
    messageQueue,
    dockerClient,
    sessionRepository,
    concurrency
  );

  // 4. Start Worker
  await worker.start();

  // Graceful Shutdown
  const shutdown = async () => {
    console.log('Shutting down worker...');
    await worker.stop();
    await RedisFactory.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(err => {
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
