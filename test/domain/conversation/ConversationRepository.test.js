"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ConversationRepository_1 = require("../../../src/domain/conversation/ConversationRepository");
const RedisFactory_1 = require("../../../src/infrastructure/cache/RedisFactory");
// Manual Mock for Redis Client v4
const mockRedisClient = {
    store: new Map(),
    rPush: jest.fn(async (key, value) => {
        if (!mockRedisClient.store.has(key))
            mockRedisClient.store.set(key, []);
        mockRedisClient.store.get(key).push(value);
    }),
    lTrim: jest.fn(async (key, start, end) => {
        // Simplified trim logic for test
        const list = mockRedisClient.store.get(key) || [];
        // Handle negative indices roughly
        const sliced = list.slice(start);
        mockRedisClient.store.set(key, sliced);
    }),
    lRange: jest.fn(async (key, start, end) => {
        return mockRedisClient.store.get(key) || [];
    }),
    del: jest.fn(async (key) => {
        mockRedisClient.store.delete(key);
    }),
    flushAll: jest.fn(async () => {
        mockRedisClient.store.clear();
    }),
    // Helper to reset
    _reset: () => mockRedisClient.store.clear()
};
describe('RedisConversationRepository', () => {
    let repo;
    beforeAll(() => {
        jest.spyOn(RedisFactory_1.RedisFactory, 'getInstance').mockResolvedValue(mockRedisClient);
    });
    afterAll(() => {
        jest.restoreAllMocks();
    });
    beforeEach(async () => {
        repo = new ConversationRepository_1.RedisConversationRepository();
        mockRedisClient._reset();
        jest.clearAllMocks();
    });
    it('should add and retrieve messages', async () => {
        const msg = { role: 'user', content: 'hello', timestamp: 123 };
        await repo.addMessage('sess-1', msg);
        const history = await repo.getHistory('sess-1');
        expect(history).toHaveLength(1);
        expect(history[0]).toEqual(msg);
        expect(mockRedisClient.rPush).toHaveBeenCalled();
    });
    it('should clear history', async () => {
        const msg = { role: 'user', content: 'hello', timestamp: 123 };
        await repo.addMessage('sess-1', msg);
        await repo.clearHistory('sess-1');
        expect(mockRedisClient.del).toHaveBeenCalledWith('mcp:conversation:sess-1');
        const history = await repo.getHistory('sess-1');
        expect(history).toHaveLength(0);
    });
});
