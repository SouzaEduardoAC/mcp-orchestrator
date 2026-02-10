import 'dotenv/config';
import { AppServer } from './infrastructure/http/Server';
import { RedisFactory } from './infrastructure/cache/RedisFactory';
import { DockerClient } from './infrastructure/docker/DockerClient';
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

  // 3. Domain Services
  const sessionManager = new SessionManager(dockerClient, sessionRepo);
  const janitor = new JanitorService(sessionManager, sessionRepo);

  // 4. Interface Layer
  const socketRegistry = new SocketRegistry(
      appServer.io, 
      sessionManager, 
      conversationRepo, 
      dockerClient
  );
  socketRegistry.initialize();

  // 5. Start Background Jobs
  janitor.start();

  // 6. Start Server
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  appServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  // Graceful Shutdown
  const shutdown = async () => {
      console.log('Shutting down...');
      janitor.stop();
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
