import { DockerClient } from '../infrastructure/docker/DockerClient';
import { SessionRepository, SessionData } from '../domain/session/SessionRepository';

export class SessionManager {
  constructor(
    private dockerClient: DockerClient,
    private sessionRepository: SessionRepository
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
        const container = await this.dockerClient.spawnContainer(image, env, cmd);
        await this.sessionRepository.saveSession(sessionId, container.id);
        
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

    await this.dockerClient.stopContainer(session.containerId);
    await this.sessionRepository.deleteSession(sessionId);
  }
}
