"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const GeminiAgent_1 = require("../../src/services/GeminiAgent");
const DockerContainerTransport_1 = require("../../src/infrastructure/transport/DockerContainerTransport");
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
// Mocks
jest.mock('@google/generative-ai');
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('../../src/infrastructure/transport/DockerContainerTransport');
const mockConversationRepo = {
    getHistory: jest.fn().mockResolvedValue([]),
    addMessage: jest.fn().mockResolvedValue(undefined),
    clearHistory: jest.fn()
};
const mockDockerClient = {
    getContainer: jest.fn().mockReturnValue({})
};
const mockEvents = {
    onThinking: jest.fn(),
    onResponse: jest.fn(),
    onToolApprovalRequired: jest.fn(),
    onToolOutput: jest.fn(),
    onError: jest.fn()
};
describe('GeminiAgent', () => {
    let agent;
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the mock Client implementation
        index_js_1.Client.mockImplementation(() => ({
            connect: jest.fn().mockResolvedValue(undefined),
            listTools: jest.fn().mockResolvedValue({ tools: [] }),
            callTool: jest.fn().mockResolvedValue({ content: "Tool Result" })
        }));
        agent = new GeminiAgent_1.GeminiAgent("fake-key", "session-1", { containerId: "c1", startTime: 0, lastActive: 0 }, mockConversationRepo, mockDockerClient, mockEvents);
    });
    it('should initialize correctly', async () => {
        await agent.initialize();
        expect(DockerContainerTransport_1.DockerContainerTransport).toHaveBeenCalled();
        expect(index_js_1.Client).toHaveBeenCalled();
    });
    // Note: Testing generateResponse requires mocking the GoogleGenerativeAI complex response object.
    // This is often brittle. For this phase, we rely on the integration test script for logic verification
    // and use unit tests for the structural setup.
});
