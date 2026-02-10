import { JanitorService } from '../../src/services/JanitorService';
import { SessionManager } from '../../src/services/SessionManager';
import { SessionRepository } from '../../src/domain/session/SessionRepository';

const mockTerminateSession = jest.fn();
const mockSessionManager = {
    terminateSession: mockTerminateSession
} as unknown as SessionManager;

const mockGetAllSessions = jest.fn();
const mockGetSession = jest.fn();
const mockSessionRepository = {
    getAllSessions: mockGetAllSessions,
    getSession: mockGetSession
} as unknown as SessionRepository;

describe('JanitorService', () => {
    let janitor: JanitorService;

    beforeEach(() => {
        jest.clearAllMocks();
        janitor = new JanitorService(mockSessionManager, mockSessionRepository);
    });

    it('should terminate expired sessions', async () => {
        const now = Date.now();
        const expiredTime = now - (16 * 60 * 1000); // 16 mins ago
        const activeTime = now - (5 * 60 * 1000); // 5 mins ago

        mockGetAllSessions.mockResolvedValue(['expired-user', 'active-user']);
        
        mockGetSession.mockImplementation(async (id: string) => {
            if (id === 'expired-user') return { containerId: 'c1', startTime: 0, lastActive: expiredTime };
            if (id === 'active-user') return { containerId: 'c2', startTime: 0, lastActive: activeTime };
            return null;
        });

        await janitor.run();

        expect(mockTerminateSession).toHaveBeenCalledTimes(1);
        expect(mockTerminateSession).toHaveBeenCalledWith('expired-user');
    });

    it('should handle errors gracefully', async () => {
        mockGetAllSessions.mockRejectedValue(new Error('Redis failure'));
        
        // Should not throw
        await expect(janitor.run()).resolves.not.toThrow();
    });
});
