import { DockerClient } from '../infrastructure/docker/DockerClient';
import { ContainerPool } from '../infrastructure/docker/ContainerPool';
import { SessionRepository, SessionData } from '../domain/session/SessionRepository';
import { ConversationRepository } from '../domain/conversation/ConversationRepository';

export class SessionManager {
  constructor(
    private dockerClient: DockerClient,
    private sessionRepository: SessionRepository,
    private conversationRepo: ConversationRepository,
    private containerPool?: ContainerPool
  ) {}

  async acquireSession(sessionId: string, image: string = 'mcp-server:latest', env: Record<string, string> = {}, cmd?: string[]): Promise<SessionData> {
    const existingSession = await this.sessionRepository.getSession(sessionId);

    if (existingSession) {
      await this.sessionRepository.updateHeartbeat(sessionId);
      return existingSession;
    }

    // Provision new session with locking to prevent race conditions
    const lockAcquired = await this.sessionRepository.acquireLock(sessionId, 30000); // 30s lock
    if (!lockAcquired) {
        // Wait briefly and retry once or throw. For simplicity, we'll wait 2s and check again.
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retrySession = await this.sessionRepository.getSession(sessionId);
        if (retrySession) return retrySession;
        throw new Error("Could not acquire session lock - session may be provisioning elsewhere");
    }

    try {
        // Use container pool if available, otherwise create directly
        const container = this.containerPool
          ? await this.containerPool.acquire(sessionId)
          : await this.dockerClient.spawnContainer(image, env, cmd);

        await this.sessionRepository.saveSession(sessionId, container.id);

        // Clear any orphaned history for new sessions
        await this.conversationRepo.clearHistory(sessionId);
        console.log(`[SessionManager] Cleared orphaned history for new session: ${sessionId}`);

        return {
            containerId: container.id,
            startTime: Date.now(),
            lastActive: Date.now()
        };
    } catch (e) {
        console.error(`Failed to provision session ${sessionId}:`, e);
        throw e;
    }
  }

  async terminateSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.getSession(sessionId);
    if (!session) return;

    // Release to pool if available, otherwise destroy directly
    if (this.containerPool) {
      await this.containerPool.release(sessionId);
    } else {
      await this.dockerClient.stopContainer(session.containerId);
    }

    await this.sessionRepository.deleteSession(sessionId);

    // CRITICAL: Clean up conversation history to prevent orphaned data
    await this.conversationRepo.clearHistory(sessionId);
    console.log(`[SessionManager] Cleaned conversation history for session: ${sessionId}`);
  }
}
