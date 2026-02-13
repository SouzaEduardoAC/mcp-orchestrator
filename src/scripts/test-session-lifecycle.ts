import { DockerClient } from '../infrastructure/docker/DockerClient';
import { RedisSessionRepository } from '../domain/session/SessionRepository';
import { RedisConversationRepository } from '../domain/conversation/ConversationRepository';
import { SessionManager } from '../services/SessionManager';
import { JanitorService } from '../services/JanitorService';
import { RedisFactory } from '../infrastructure/cache/RedisFactory';

async function main() {
  console.log('Initializing components...');
  const dockerClient = new DockerClient();
  const sessionRepo = new RedisSessionRepository();
  const conversationRepo = new RedisConversationRepository();
  const sessionManager = new SessionManager(dockerClient, sessionRepo, conversationRepo);
  const janitor = new JanitorService(sessionManager, sessionRepo);

  // Setup test user
  const userId = `test-user-${Date.now()}`;
  const image = 'alpine:latest';

  console.log(`[1] Pulling image ${image}...`);
  try {
      await dockerClient.pullImage(image);
  } catch (e) {
      console.warn('Pull skipped/failed', e);
  }

  console.log(`[2] Acquiring session for ${userId}...`);
  const session1 = await sessionManager.acquireSession(userId, image, {}, ['sleep', '300']);
  console.log(`    Session acquired. Container ID: ${session1.containerId}`);

  // Verify container is running
  try {
      const container1 = dockerClient.getContainer(session1.containerId);
      const info1 = await container1.inspect();
      if (!info1.State.Running) throw new Error('Container is not running');
      console.log('    VERIFIED: Container is running.');
  } catch (e) {
      console.error('    FAILED: Container verification failed', e);
      process.exit(1);
  }

  console.log('[3] Re-acquiring session (expect same container)...');
  const session2 = await sessionManager.acquireSession(userId, image);
  if (session2.containerId !== session1.containerId) {
      console.error(`    FAILED: Container IDs do not match! ${session1.containerId} vs ${session2.containerId}`);
      process.exit(1);
  }
  console.log('    VERIFIED: Same container returned.');

  console.log('[4] Simulating expiration...');
  // Manually hack the redis entry to be old
  const client = await RedisFactory.getInstance();
  const oldTime = Date.now() - (20 * 60 * 1000); // 20 mins ago
  const data = {
      containerId: session1.containerId,
      startTime: oldTime,
      lastActive: oldTime
  };
  await client.set(`mcp:session:${userId}`, JSON.stringify(data));
  
  console.log('[5] Running Janitor...');
  await janitor.run();

  // Verify container is gone
  console.log('[6] Verifying cleanup...');
  try {
      const containerEnd = dockerClient.getContainer(session1.containerId);
      await containerEnd.inspect();
      console.error('    FAILED: Container still exists!');
      // Cleanup anyway
      await sessionManager.terminateSession(userId);
      process.exit(1);
  } catch (e: any) {
      if (e.statusCode === 404) {
          console.log('    VERIFIED: Container is gone (404).');
      } else {
          console.error('    FAILED: Unexpected error checking container', e);
          process.exit(1);
      }
  }

  // Cleanup redis connection
  await RedisFactory.close();
  console.log('SUCCESS: Session Lifecycle Verified.');
}

main().catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
});
