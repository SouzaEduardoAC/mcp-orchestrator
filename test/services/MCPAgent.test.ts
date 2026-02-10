import { MCPAgent } from '../../src/services/MCPAgent';
import { DockerContainerTransport } from '../../src/infrastructure/transport/DockerContainerTransport';
import { ConversationRepository } from '../../src/domain/conversation/ConversationRepository';
import { DockerClient } from '../../src/infrastructure/docker/DockerClient';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { LLMProvider } from '../../src/interfaces/llm/LLMProvider';

// Mocks
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('../../src/infrastructure/transport/DockerContainerTransport');

const mockConversationRepo = {
    getHistory: jest.fn().mockResolvedValue([]),
    addMessage: jest.fn().mockResolvedValue(undefined),
    clearHistory: jest.fn()
} as unknown as ConversationRepository;

const mockDockerClient = {
    getContainer: jest.fn().mockReturnValue({})
} as unknown as DockerClient;

const mockEvents = {
    onThinking: jest.fn(),
    onResponse: jest.fn(),
    onToolApprovalRequired: jest.fn(),
    onToolOutput: jest.fn(),
    onError: jest.fn()
};

const mockProvider = {
    generateResponse: jest.fn().mockResolvedValue({ text: "Hello" })
} as unknown as LLMProvider;

describe('MCPAgent', () => {
    let agent: MCPAgent;
    
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the mock Client implementation
        (Client as unknown as jest.Mock).mockImplementation(() => ({
            connect: jest.fn().mockResolvedValue(undefined),
            listTools: jest.fn().mockResolvedValue({ tools: [] }),
            callTool: jest.fn().mockResolvedValue({ content: "Tool Result" })
        }));

        agent = new MCPAgent(
            mockProvider,
            "session-1",
            { containerId: "c1", startTime: 0, lastActive: 0 },
            mockConversationRepo,
            mockDockerClient,
            mockEvents
        );
    });

    it('should initialize correctly', async () => {
        await agent.initialize();
        expect(DockerContainerTransport).toHaveBeenCalled();
        expect(Client).toHaveBeenCalled();
    });

    it('should call provider on generateResponse', async () => {
        await agent.initialize();
        await agent.generateResponse("test prompt");
        expect(mockProvider.generateResponse).toHaveBeenCalled();
        expect(mockEvents.onResponse).toHaveBeenCalledWith("Hello");
    });
});
