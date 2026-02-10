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

    // Provision new session
    // TODO: Add locking mechanism (SETNX) to prevent race conditions on double-spawn
    const container = await this.dockerClient.spawnContainer(image, env, cmd);
    
    await this.sessionRepository.saveSession(sessionId, container.id);
    
    return {
        containerId: container.id,
        startTime: Date.now(), // Repository overrides this but good for local reasoning
        lastActive: Date.now()
    };
  }

  async terminateSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.getSession(sessionId);
    if (!session) return;

    await this.dockerClient.stopContainer(session.containerId);
    await this.sessionRepository.deleteSession(sessionId);
  }
}
