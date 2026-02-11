import { ConversationRepository } from '../domain/conversation/ConversationRepository';
import { SessionData } from '../domain/session/SessionRepository';
import { DockerClient } from '../infrastructure/docker/DockerClient';
import { LLMProvider, ToolDefinition } from '../interfaces/llm/LLMProvider';
import { MCPConnectionManager } from './MCPConnectionManager';

export interface AgentEvents {
  onThinking: () => void;
  onResponse: (text: string) => void;
  onToolApprovalRequired: (toolName: string, args: any, callId: string) => void;
  onToolOutput: (output: string) => void;
  onError: (error: string) => void;
}

export class MCPAgent {
  private connectionManager: MCPConnectionManager;

  // Pending tool call state
  private pendingCall: { id: string; name: string; args: any } | null = null;

  constructor(
    private provider: LLMProvider,
    private sessionId: string,
    private sessionData: SessionData,
    private conversationRepo: ConversationRepository,
    private dockerClient: DockerClient,
    private events: AgentEvents
  ) {
    this.connectionManager = new MCPConnectionManager(dockerClient);
  }

  async initialize() {
    // Connect to all enabled MCPs from registry
    await this.connectionManager.initialize();
    const connectedMCPs = this.connectionManager.getConnectedMCPs();
    console.log(`[Agent ${this.sessionId}] Connected to MCPs:`, connectedMCPs);
  }

  async generateResponse(userPrompt: string) {
    try {
      this.events.onThinking();

      // 1. Load History
      const history = await this.conversationRepo.getHistory(this.sessionId);

      // 2. Add User Message
      await this.conversationRepo.addMessage(this.sessionId, {
        role: 'user',
        content: userPrompt,
        timestamp: Date.now()
      });

      // 3. Fetch Tools from all connected MCPs
      const tools = await this.connectionManager.getAllTools();

      // 4. Call Provider
      const result = await this.provider.generateResponse(history, userPrompt, tools);

      // 5. Handle Tool Calls
      if (result.toolCalls && result.toolCalls.length > 0) {
          const call = result.toolCalls[0]; // Handle single call for simplicity
          this.pendingCall = {
              id: call.id || "call_" + Date.now(),
              name: call.name,
              args: call.args
          };

          this.events.onToolApprovalRequired(call.name, call.args, this.pendingCall.id);
          return;
      }

      // 6. Handle Response
      this.events.onResponse(result.text);
      await this.conversationRepo.addMessage(this.sessionId, {
          role: 'model',
          content: result.text,
          timestamp: Date.now()
      });

    } catch (e: any) {
      this.events.onError(e.message);
    }
  }

  async executeTool(callId: string) {
      if (!this.pendingCall || this.pendingCall.id !== callId) {
          this.events.onError("No matching pending tool call");
          return;
      }

      this.events.onThinking();

      try {
          const result = await this.connectionManager.executeTool(
            this.pendingCall.name,
            this.pendingCall.args
          );

          // Serialize output
          const outputText = JSON.stringify(result.content);
          this.events.onToolOutput(outputText);

          // Feed back to Repository
          await this.conversationRepo.addMessage(this.sessionId, {
              role: 'tool',
              content: `Tool Output: ${outputText}`,
              timestamp: Date.now()
          });

          // Recurse with system message
          await this.generateResponse(`(System) Tool execution result: ${outputText}`);

          this.pendingCall = null;

      } catch (e: any) {
          this.events.onError(`Tool execution failed: ${e.message}`);
          this.pendingCall = null;
      }
  }
  
  async cleanup() {
      try {
          await this.connectionManager.cleanup();
      } catch (e) { console.error("Error cleaning up MCP connections", e); }
  }
}
