"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const JanitorService_1 = require("../../src/services/JanitorService");
const mockTerminateSession = jest.fn();
const mockSessionManager = {
    terminateSession: mockTerminateSession
};
const mockGetAllSessions = jest.fn();
const mockGetSession = jest.fn();
const mockSessionRepository = {
    getAllSessions: mockGetAllSessions,
    getSession: mockGetSession
};
describe('JanitorService', () => {
    let janitor;
    beforeEach(() => {
        jest.clearAllMocks();
        janitor = new JanitorService_1.JanitorService(mockSessionManager, mockSessionRepository);
    });
    it('should terminate expired sessions', async () => {
        const now = Date.now();
        const expiredTime = now - (16 * 60 * 1000); // 16 mins ago
        const activeTime = now - (5 * 60 * 1000); // 5 mins ago
        mockGetAllSessions.mockResolvedValue(['expired-user', 'active-user']);
        mockGetSession.mockImplementation(async (id) => {
            if (id === 'expired-user')
                return { containerId: 'c1', startTime: 0, lastActive: expiredTime };
            if (id === 'active-user')
                return { containerId: 'c2', startTime: 0, lastActive: activeTime };
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
