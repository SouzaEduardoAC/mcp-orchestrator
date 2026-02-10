import { SessionManager } from './SessionManager';
import { SessionRepository } from '../domain/session/SessionRepository';

export class JanitorService {
  private intervalId?: NodeJS.Timeout;
  private readonly MAX_IDLE_TIME_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private sessionManager: SessionManager,
    private sessionRepository: SessionRepository
  ) {}

  start(intervalMs: number = 60000) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.run(), intervalMs);
    console.log('JanitorService started.');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async run() {
    try {
      const sessionIds = await this.sessionRepository.getAllSessions();
      const now = Date.now();

      for (const id of sessionIds) {
        const session = await this.sessionRepository.getSession(id);
        if (session) {
          if (now - session.lastActive > this.MAX_IDLE_TIME_MS) {
            console.log(`[Janitor] Terminating expired session: ${id}`);
            await this.sessionManager.terminateSession(id);
          }
        }
      }
    } catch (error) {
      console.error('[Janitor] Error running cleanup cycle:', error);
    }
  }
}
