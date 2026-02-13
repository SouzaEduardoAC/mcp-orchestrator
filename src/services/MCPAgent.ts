import { ConversationRepository } from '../domain/conversation/ConversationRepository';
import { SessionData } from '../domain/session/SessionRepository';
import { DockerClient } from '../infrastructure/docker/DockerClient';
import { LLMProvider, ToolDefinition } from '../interfaces/llm/LLMProvider';
import { MCPConnectionManager } from './MCPConnectionManager';
import { MCPHealthMonitor } from './MCPHealthMonitor';
import { TokenCounter } from '../utils/TokenCounter';

export interface AgentEvents {
  onThinking: () => void;
  onResponse: (text: string) => void;
  onToolApprovalRequired: (
    toolName: string,
    args: any,
    callId: string,
    queuePosition?: number,
    totalInQueue?: number
  ) => void;
  onToolOutput: (output: string) => void;
  onError: (error: string) => void;
}

export class MCPAgent {
  private connectionManager: MCPConnectionManager;
  private healthMonitor: MCPHealthMonitor;

  // Pending tool calls queue
  private pendingCalls: Array<{
    id: string;
    name: string;
    args: any;
    status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
    result?: any;
    error?: string;
  }> = [];

  constructor(
    private provider: LLMProvider,
    private sessionId: string,
    private sessionData: SessionData,
    private conversationRepo: ConversationRepository,
    private dockerClient: DockerClient,
    private events: AgentEvents
  ) {
    this.connectionManager = new MCPConnectionManager(dockerClient);
    this.healthMonitor = new MCPHealthMonitor(this.connectionManager, 60000); // 60s interval

    // Listen to health events
    this.setupHealthMonitoring();
  }

  private setupHealthMonitoring(): void {
    this.healthMonitor.on('mcp-unhealthy', (name, health) => {
      console.warn(`[Agent ${this.sessionId}] MCP '${name}' became unhealthy:`, health.error);
    });

    this.healthMonitor.on('mcp-healthy', (name) => {
      console.log(`[Agent ${this.sessionId}] MCP '${name}' recovered`);
    });

    this.healthMonitor.on('reconnect-attempt', (name, attempt) => {
      console.log(`[Agent ${this.sessionId}] Reconnecting to '${name}' (attempt ${attempt})`);
    });

    this.healthMonitor.on('reconnect-success', (name) => {
      console.log(`[Agent ${this.sessionId}] Successfully reconnected to '${name}'`);
    });

    this.healthMonitor.on('reconnect-failed', (name, error) => {
      console.error(`[Agent ${this.sessionId}] Failed to reconnect to '${name}': ${error}`);
    });
  }

  async initialize() {
    // Connect to all enabled MCPs from registry
    await this.connectionManager.initialize();
    const connectedMCPs = this.connectionManager.getConnectedMCPs();
    console.log(`[Agent ${this.sessionId}] Connected to MCPs:`, connectedMCPs);

    // Start health monitoring
    this.healthMonitor.start();
  }

  async generateResponse(userPrompt: string) {
    try {
      this.events.onThinking();

      // 1. Load History (with token-aware truncation)
      const history = await this.conversationRepo.getHistory(this.sessionId);

      // 2. Add User Message
      await this.conversationRepo.addMessage(this.sessionId, {
        role: 'user',
        content: userPrompt,
        timestamp: Date.now()
      });

      // 3. Fetch Tools from all connected MCPs
      const tools = await this.connectionManager.getAllTools();

      // 4. Validate total token count before sending
      const historyTokens = TokenCounter.countHistoryTokens(history);
      const promptTokens = TokenCounter.estimateTokens(userPrompt);
      const toolsTokens = this.estimateToolDefinitionTokens(tools);
      const totalTokens = historyTokens + promptTokens + toolsTokens;

      // Leave room for response (5k tokens buffer)
      const maxInputTokens = 195000; // 200k limit - 5k buffer

      // Log token usage metrics
      console.log(`[MCPAgent] Token usage for ${this.sessionId}:`, {
        history: historyTokens,
        prompt: promptTokens,
        tools: toolsTokens,
        total: totalTokens,
        limit: maxInputTokens,
        utilization: `${((totalTokens / maxInputTokens) * 100).toFixed(1)}%`
      });

      if (totalTokens > maxInputTokens) {
        const errorMsg = `Token limit exceeded: ${totalTokens} > ${maxInputTokens}. History: ${historyTokens}, Prompt: ${promptTokens}, Tools: ${toolsTokens}`;
        console.error(`[MCPAgent] ${errorMsg}`);

        // Try again with reduced history
        console.log('[MCPAgent] Retrying with reduced history...');
        await this.conversationRepo.clearHistory(this.sessionId);

        // Add only current prompt
        await this.conversationRepo.addMessage(this.sessionId, {
          role: 'user',
          content: userPrompt,
          timestamp: Date.now()
        });

        // Reload with just current message
        const freshHistory = await this.conversationRepo.getHistory(this.sessionId);
        const result = await this.provider.generateResponse(freshHistory, userPrompt, tools);

        // Handle the result
        if (result.toolCalls && result.toolCalls.length > 0) {
          this.pendingCalls = result.toolCalls.map((call, index) => ({
            id: call.id || `call_${Date.now()}_${index}`,
            name: call.name,
            args: call.args,
            status: 'pending'
          }));

          const firstCall = this.pendingCalls[0];
          this.events.onToolApprovalRequired(
            firstCall.name,
            firstCall.args,
            firstCall.id,
            1,
            this.pendingCalls.length
          );
          return;
        }

        this.events.onResponse(result.text);
        await this.conversationRepo.addMessage(this.sessionId, {
          role: 'model',
          content: result.text,
          timestamp: Date.now()
        });
        return;
      }

      // 5. Call Provider
      const result = await this.provider.generateResponse(history, userPrompt, tools);

      // 5. Handle Tool Calls
      if (result.toolCalls && result.toolCalls.length > 0) {
          // Store ALL tool calls with unique IDs
          this.pendingCalls = result.toolCalls.map((call, index) => ({
              id: call.id || `call_${Date.now()}_${index}`,
              name: call.name,
              args: call.args,
              status: 'pending'
          }));

          // Emit first pending tool for approval
          const firstCall = this.pendingCalls[0];
          this.events.onToolApprovalRequired(
              firstCall.name,
              firstCall.args,
              firstCall.id,
              1, // queuePosition
              this.pendingCalls.length // totalInQueue
          );
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

  async executeTool(callId: string, approved: boolean = true) {
      const callIndex = this.pendingCalls.findIndex(c => c.id === callId);
      if (callIndex === -1) {
          this.events.onError("No matching pending tool call");
          return;
      }

      const call = this.pendingCalls[callIndex];

      // Handle rejection
      if (!approved) {
          call.status = 'rejected';
          await this.processNextOrFinish();
          return;
      }

      // Mark as approved
      call.status = 'approved';
      await this.processNextOrFinish();
  }

  private async processNextOrFinish() {
      // Find next pending tool
      const nextPending = this.pendingCalls.find(c => c.status === 'pending');

      if (nextPending) {
          // Request approval for next tool
          const position = this.pendingCalls.findIndex(c => c.id === nextPending.id) + 1;
          this.events.onToolApprovalRequired(
              nextPending.name,
              nextPending.args,
              nextPending.id,
              position,
              this.pendingCalls.length
          );
      } else {
          // All tools processed, execute approved ones
          await this.executeApprovedTools();
      }
  }

  private async executeApprovedTools() {
      const approved = this.pendingCalls.filter(c => c.status === 'approved');
      if (approved.length === 0) {
          await this.finishToolSequence();
          return;
      }

      this.events.onThinking();

      // Execute all approved tools in parallel
      const results = await Promise.allSettled(
          approved.map(async (call) => {
              call.status = 'executing';
              try {
                  const result = await this.connectionManager.executeTool(call.name, call.args);
                  call.status = 'completed';
                  call.result = result;
                  return result;
              } catch (e: any) {
                  call.status = 'failed';
                  call.error = e.message;
                  throw e;
              }
          })
      );

      // Emit outputs
      for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const call = approved[i];
          if (result.status === 'fulfilled') {
              const outputText = JSON.stringify(result.value.content);
              this.events.onToolOutput(outputText);
              await this.conversationRepo.addMessage(this.sessionId, {
                  role: 'tool',
                  content: `Tool ${call.name}: ${outputText}`,
                  timestamp: Date.now()
              });
          } else {
              this.events.onError(`Tool ${call.name} failed: ${call.error}`);
          }
      }

      await this.finishToolSequence();
  }

  private async finishToolSequence() {
      const completed = this.pendingCalls.filter(c => c.status === 'completed');

      // Aggregate results and feed back to LLM
      const resultsText = completed.map(c =>
          `${c.name}: ${JSON.stringify(c.result?.content)}`
      ).join('\n');

      // Clear queue BEFORE calling generateResponse to avoid clearing new tool calls
      this.pendingCalls = [];

      if (resultsText) {
          await this.generateResponse(`(System) Tool execution results:\n${resultsText}`);
      }
  }
  
  /**
   * Estimate tokens for tool definitions.
   * Tool schemas add to the input token count.
   */
  private estimateToolDefinitionTokens(tools: ToolDefinition[]): number {
    const toolsJson = JSON.stringify(tools);
    return TokenCounter.estimateTokens(toolsJson);
  }

  async cleanup() {
      try {
          this.pendingCalls = []; // Clear queue
          this.healthMonitor.stop();
          await this.connectionManager.cleanup();
      } catch (e) { console.error("Error cleaning up MCP connections", e); }
  }

  /**
   * Get health status for all MCPs
   */
  getHealthStatus() {
    return this.healthMonitor.getAllHealth();
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    return this.healthMonitor.getHealthSummary();
  }
}
