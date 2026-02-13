import { SessionManager } from '../../src/services/SessionManager';
import { DockerClient } from '../../src/infrastructure/docker/DockerClient';
import { SessionRepository } from '../../src/domain/session/SessionRepository';
import { ConversationRepository } from '../../src/domain/conversation/ConversationRepository';

// Mocks
const mockSpawnContainer = jest.fn();
const mockStopContainer = jest.fn();
const mockDockerClient = {
    spawnContainer: mockSpawnContainer,
    stopContainer: mockStopContainer,
    pullImage: jest.fn(),
    getContainer: jest.fn()
} as unknown as DockerClient;

const mockSaveSession = jest.fn();
const mockGetSession = jest.fn();
const mockUpdateHeartbeat = jest.fn();
const mockDeleteSession = jest.fn();
const mockAcquireLock = jest.fn();
const mockSessionRepository = {
    saveSession: mockSaveSession,
    getSession: mockGetSession,
    updateHeartbeat: mockUpdateHeartbeat,
    deleteSession: mockDeleteSession,
    getAllSessions: jest.fn(),
    acquireLock: mockAcquireLock
} as unknown as SessionRepository;

const mockClearHistory = jest.fn();
const mockConversationRepository = {
    clearHistory: mockClearHistory,
    addMessage: jest.fn(),
    getHistory: jest.fn()
} as unknown as ConversationRepository;

describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        sessionManager = new SessionManager(mockDockerClient, mockSessionRepository, mockConversationRepository);
    });

    it('should acquire a new session if it does not exist', async () => {
        mockGetSession.mockResolvedValue(null);
        mockAcquireLock.mockResolvedValue(true);
        mockSpawnContainer.mockResolvedValue({ id: 'container-123' });

        const session = await sessionManager.acquireSession('user-1');

        expect(mockGetSession).toHaveBeenCalledWith('user-1');
        expect(mockAcquireLock).toHaveBeenCalledWith('user-1', 30000);
        expect(mockSpawnContainer).toHaveBeenCalled();
        expect(mockSaveSession).toHaveBeenCalledWith('user-1', 'container-123');
        expect(mockClearHistory).toHaveBeenCalledWith('user-1');
        expect(session.containerId).toBe('container-123');
    });

    it('should return existing session and update heartbeat', async () => {
        const existingSession = { containerId: 'existing-123', startTime: 100, lastActive: 100 };
        mockGetSession.mockResolvedValue(existingSession);

        const session = await sessionManager.acquireSession('user-1');

        expect(mockGetSession).toHaveBeenCalledWith('user-1');
        expect(mockSpawnContainer).not.toHaveBeenCalled();
        expect(mockUpdateHeartbeat).toHaveBeenCalledWith('user-1');
        expect(session.containerId).toBe('existing-123');
    });

    it('should terminate a session', async () => {
        const existingSession = { containerId: 'term-123', startTime: 100, lastActive: 100 };
        mockGetSession.mockResolvedValue(existingSession);

        await sessionManager.terminateSession('user-1');

        expect(mockStopContainer).toHaveBeenCalledWith('term-123');
        expect(mockDeleteSession).toHaveBeenCalledWith('user-1');
        expect(mockClearHistory).toHaveBeenCalledWith('user-1');
    });

    it('should do nothing when terminating a non-existent session', async () => {
        mockGetSession.mockResolvedValue(null);

        await sessionManager.terminateSession('user-999');

        expect(mockStopContainer).not.toHaveBeenCalled();
        expect(mockDeleteSession).not.toHaveBeenCalled();
    });
});
