import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { DockerContainerTransport } from '../infrastructure/transport/DockerContainerTransport';
import { ConversationRepository } from '../domain/conversation/ConversationRepository';
import { SessionData } from '../domain/session/SessionRepository';
import { DockerClient } from '../infrastructure/docker/DockerClient';
import { LLMProvider, ToolDefinition } from '../interfaces/llm/LLMProvider';

export interface AgentEvents {
  onThinking: () => void;
  onResponse: (text: string) => void;
  onToolApprovalRequired: (toolName: string, args: any, callId: string) => void;
  onToolOutput: (output: string) => void;
  onError: (error: string) => void;
}

export class MCPAgent {
  private mcpClient: Client | null = null;
  private transport: DockerContainerTransport | null = null;
  
  // Pending tool call state
  private pendingCall: { id: string; name: string; args: any } | null = null;

  constructor(
    private provider: LLMProvider,
    private sessionId: string,
    private sessionData: SessionData,
    private conversationRepo: ConversationRepository,
    private dockerClient: DockerClient,
    private events: AgentEvents
  ) {}

  async initialize() {
    // Connect to MCP
    const container = this.dockerClient.getContainer(this.sessionData.containerId);
    this.transport = new DockerContainerTransport(container);
    
    // Connect transport first
    await this.transport.start();

    this.mcpClient = new Client(
      {
        name: "mcp-orchestrator",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    // Connect client to transport
    await this.mcpClient.connect(this.transport);
    console.log(`[Agent ${this.sessionId}] MCP Client Connected`);
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

      // 3. Fetch Tools from MCP
      if (!this.mcpClient) throw new Error("MCP Client not initialized");
      const toolsResult = await this.mcpClient.listTools();
      const tools: ToolDefinition[] = toolsResult.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
      }));

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
          if (!this.mcpClient) throw new Error("MCP Client not connected");

          let toolName = this.pendingCall.name;
          
          // Reverse normalization (Gemini might have changed - to _)
          // We check the actual tool list from MCP
          const toolsList = await this.mcpClient.listTools();
          const match = toolsList.tools.find(t => t.name.replace(/-/g, '_') === toolName || t.name === toolName);
          if (match) toolName = match.name;

          const result = await this.mcpClient.callTool({
              name: toolName,
              arguments: this.pendingCall.args
          });

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
          await this.transport?.close();
      } catch (e) { console.error("Error closing transport", e); }
  }
}
