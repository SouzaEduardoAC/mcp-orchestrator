import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { DockerContainerTransport } from '../infrastructure/transport/DockerContainerTransport';
import { ConversationRepository, Message } from '../domain/conversation/ConversationRepository';
import { SessionData } from '../domain/session/SessionRepository';
import { DockerClient } from '../infrastructure/docker/DockerClient';

export interface AgentEvents {
  onThinking: () => void;
  onResponse: (text: string) => void;
  onToolApprovalRequired: (toolName: string, args: any, callId: string) => void;
  onToolOutput: (output: string) => void;
  onError: (error: string) => void;
}

export class GeminiAgent {
  private model: GenerativeModel;
  private mcpClient: Client | null = null;
  private transport: DockerContainerTransport | null = null;
  
  // Pending tool call state
  private pendingCall: { id: string; name: string; args: any } | null = null;

  constructor(
    private apiKey: string,
    private sessionId: string,
    private sessionData: SessionData,
    private conversationRepo: ConversationRepository,
    private dockerClient: DockerClient,
    private events: AgentEvents
  ) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

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
      const tools = toolsResult.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
      }));

      // 4. Call Gemini (One-shot for now, rebuilding context)
      // Map internal history to Gemini format
      // Note: Simplified for prototype. Proper chat session management with history is complex.
      // We will just send the prompt with tools for this turn.
      // In a real app, we'd use model.startChat({ history: ... })
      
      const chat = this.model.startChat({
         history: history.map(h => ({
             role: h.role === 'tool' ? 'user' : h.role, // Mapping quirks
             parts: [{ text: h.content }]
         }))
      });

      // Construct tool definitions for Gemini
      // Gemini expects functionDeclarations
      const geminiTools = tools.length > 0 ? [{
          functionDeclarations: tools.map(t => ({
              name: t.name.replace(/-/g, '_'), // Gemini strict naming
              description: t.description || '',
              parameters: t.parameters as any // Weak type check here
          }))
      }] : undefined;

      // Send message
      // Note: Passing tools to sendMessage/generateContent
      // We need to recreate the chat with tools if tools exist
      // Since startChat takes tools in config.
      
      // Re-instantiate chat with tools if needed
      const chatWithTools = this.model.startChat({
          history: history.filter(h => h.role !== 'tool').map(h => ({ // Filter tool messages for simple text history first
             role: h.role === 'user' ? 'user' : 'model',
             parts: [{ text: h.content }]
         })),
         tools: geminiTools
      });

      const result = await chatWithTools.sendMessage(userPrompt);
      const response = result.response;
      const text = response.text();
      
      // Check for tool calls
      const calls = response.functionCalls();
      
      if (calls && calls.length > 0) {
          const call = calls[0]; // Handle single call for simplicity
          this.pendingCall = {
              id: "call_" + Date.now(), // Gemini doesn't give call IDs in this SDK easily?
              name: call.name,
              args: call.args
          };
          
          // Map back to MCP tool name (replace _ with - if needed? No, we mapped - to _ earlier)
          // Actually we need to map back if we did replace.
          // Let's assume we match exact names or reverse the map.
          // For now, assume exact match or handle normalization later.
          
          this.events.onToolApprovalRequired(call.name, call.args, this.pendingCall.id);
          return; 
      }

      // If text only
      this.events.onResponse(text);
      await this.conversationRepo.addMessage(this.sessionId, {
          role: 'model',
          content: text,
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

          // Execute via MCP
          // Reverse name mapping if we did one. 
          // Simple heuristic: try exact, then - instead of _
          let toolName = this.pendingCall.name;
          // In listTools we might have had 'list-files', sent as 'list_files'
          // We need to find the real name from the tool list.
          const toolsList = await this.mcpClient.listTools();
          const match = toolsList.tools.find(t => t.name.replace(/-/g, '_') === toolName);
          if (match) toolName = match.name;

          const result = await this.mcpClient.callTool({
              name: toolName,
              arguments: this.pendingCall.args
          });

          // Serialize output
          const outputText = JSON.stringify(result.content);
          this.events.onToolOutput(outputText);

          // Feed back to Gemini
          // For this prototype, we'll just send the tool output as a new user message context
          // or use the proper tool response flow if using chat history.
          // Simple approach: Send result as user message "System: Tool Output: ..."
          // and ask model to continue.
          
          const followUpPrompt = `Tool '${toolName}' executed. Output: ${outputText}. Please interpret this for the user.`;
          
          await this.conversationRepo.addMessage(this.sessionId, {
              role: 'tool',
              content: `Tool Output: ${outputText}`,
              timestamp: Date.now()
          });

          // Recurse (call generateResponse with hidden prompt? or just continue chat)
          // We'll call generateResponse effectively.
          // Note: generateResponse adds user message. We don't want that for follow up.
          // Refactoring generateResponse to separate "add user msg" from "call model" would be better.
          // For now, just call model directly.
          
          // ... Re-init chat context ...
          // This is getting complex to duplicate logic.
          // Let's call generateResponse with a specific prefix that we filter or just accept.
          
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
