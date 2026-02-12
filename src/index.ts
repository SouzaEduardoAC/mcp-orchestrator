import 'dotenv/config';
import { AppServer } from './infrastructure/http/Server';
import { RedisFactory } from './infrastructure/cache/RedisFactory';
import { DockerClient } from './infrastructure/docker/DockerClient';
import { ContainerPool } from './infrastructure/docker/ContainerPool';
import { SessionManager } from './services/SessionManager';
import { JanitorService } from './services/JanitorService';
import { RedisConversationRepository } from './domain/conversation/ConversationRepository';
import { RedisSessionRepository } from './domain/session/SessionRepository';
import { SocketRegistry } from './interfaces/socket/SocketRegistry';

async function bootstrap() {
  console.log('Starting MCP Orchestrator...');

  // 1. Infrastructure
  await RedisFactory.getInstance();
  const dockerClient = new DockerClient();
  const appServer = new AppServer();

  // 2. Repositories
  const sessionRepo = new RedisSessionRepository();
  const conversationRepo = new RedisConversationRepository();

  // 3. Container Pool (Phase 2 Optimization - Optional)
  const enableContainerPool = process.env.ENABLE_CONTAINER_POOL === 'true';
  let containerPool: ContainerPool | undefined;

  if (enableContainerPool) {
    console.log('[Phase 2] Container pooling enabled');
    containerPool = new ContainerPool(dockerClient, {
      minPoolSize: parseInt(process.env.POOL_MIN_SIZE || '10'),
      maxPoolSize: parseInt(process.env.POOL_MAX_SIZE || '100'),
      idleTimeoutMs: parseInt(process.env.POOL_IDLE_TIMEOUT_MS || '900000'), // 15 min
      image: 'mcp-server:latest',
      env: {}
    });
    await containerPool.initialize();
  } else {
    console.log('[Phase 2] Container pooling disabled (set ENABLE_CONTAINER_POOL=true to enable)');
  }

  // 4. Domain Services
  const sessionManager = new SessionManager(dockerClient, sessionRepo, containerPool);
  const janitor = new JanitorService(sessionManager, sessionRepo);

  // 5. Interface Layer
  const socketRegistry = new SocketRegistry(
      appServer.io,
      sessionManager,
      conversationRepo,
      dockerClient
  );
  socketRegistry.initialize();

  // 6. Start Background Jobs
  janitor.start();

  // 7. Start Server
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  appServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  // Graceful Shutdown
  const shutdown = async () => {
      console.log('Shutting down...');
      janitor.stop();
      if (containerPool) {
        await containerPool.shutdown();
      }
      appServer.close();
      await RedisFactory.close();
      process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
