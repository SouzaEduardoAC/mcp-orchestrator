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

    describe('Multiple Tool Call Handling', () => {
        beforeEach(async () => {
            await agent.initialize();
        });

        it('should store multiple tool calls in queue', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'read_file', args: { path: 'file1.txt' } },
                { id: 'call_2', name: 'read_file', args: { path: 'file2.txt' } },
                { id: 'call_3', name: 'list_tools', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            await agent.generateResponse("Read files and list tools");

            // Should emit first tool for approval
            expect(mockEvents.onToolApprovalRequired).toHaveBeenCalledWith(
                'read_file',
                { path: 'file1.txt' },
                'call_1',
                1,
                3
            );
        });

        it('should handle sequential approval flow', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'tool1', args: {} },
                { id: 'call_2', name: 'tool2', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            await agent.generateResponse("Use two tools");

            // Approve first tool
            await agent.executeTool('call_1', true);

            // Should emit second tool for approval
            expect(mockEvents.onToolApprovalRequired).toHaveBeenCalledWith(
                'tool2',
                {},
                'call_2',
                2,
                2
            );
        });

        it('should execute approved tools in parallel', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'tool1', args: {} },
                { id: 'call_2', name: 'tool2', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            await agent.generateResponse("Use two tools");

            // Approve both tools
            await agent.executeTool('call_1', true);
            await agent.executeTool('call_2', true);

            // Both tools should execute (onToolOutput called for each)
            expect(mockEvents.onToolOutput).toHaveBeenCalledTimes(2);
        });

        it('should handle rejection and continue with remaining tools', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'tool1', args: {} },
                { id: 'call_2', name: 'tool2', args: {} },
                { id: 'call_3', name: 'tool3', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            await agent.generateResponse("Use three tools");

            // Reject first tool
            await agent.executeTool('call_1', false);

            // Should proceed to second tool
            expect(mockEvents.onToolApprovalRequired).toHaveBeenCalledWith(
                'tool2',
                {},
                'call_2',
                2,
                3
            );
        });

        it('should handle mixed approval/rejection', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'tool1', args: {} },
                { id: 'call_2', name: 'tool2', args: {} },
                { id: 'call_3', name: 'tool3', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            await agent.generateResponse("Use three tools");

            // Approve first, reject second, approve third
            await agent.executeTool('call_1', true);
            await agent.executeTool('call_2', false);
            await agent.executeTool('call_3', true);

            // Only approved tools should execute (2 outputs)
            expect(mockEvents.onToolOutput).toHaveBeenCalledTimes(2);
        });

        it('should handle failed tool execution gracefully', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'failing_tool', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            // Mock tool execution failure
            const mockClient = (Client as unknown as jest.Mock).mock.results[0].value;
            mockClient.callTool = jest.fn().mockRejectedValue(new Error('Tool failed'));

            await agent.generateResponse("Use failing tool");
            await agent.executeTool('call_1', true);

            // Should emit error
            expect(mockEvents.onError).toHaveBeenCalledWith(
                expect.stringContaining('Tool failing_tool failed')
            );
        });

        it('should handle single tool call (backward compatibility)', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'single_tool', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            await agent.generateResponse("Use single tool");

            // Should emit approval with position 1 of 1
            expect(mockEvents.onToolApprovalRequired).toHaveBeenCalledWith(
                'single_tool',
                {},
                'call_1',
                1,
                1
            );
        });

        it('should clear queue after completion', async () => {
            const mockToolCalls = [
                { id: 'call_1', name: 'tool1', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: mockToolCalls
            });

            await agent.generateResponse("Use one tool");
            await agent.executeTool('call_1', true);

            // Start new request - should not have interference
            const newMockToolCalls = [
                { id: 'call_2', name: 'tool2', args: {} }
            ];

            (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
                toolCalls: newMockToolCalls
            });

            await agent.generateResponse("Use another tool");

            // Should emit new tool approval
            expect(mockEvents.onToolApprovalRequired).toHaveBeenLastCalledWith(
                'tool2',
                {},
                'call_2',
                1,
                1
            );
        });
    });
});
