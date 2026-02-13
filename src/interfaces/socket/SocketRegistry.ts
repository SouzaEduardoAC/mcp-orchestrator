import { Server, Socket } from 'socket.io';
import { SessionManager } from '../../services/SessionManager';
import { ConversationRepository } from '../../domain/conversation/ConversationRepository';
import { DockerClient } from '../../infrastructure/docker/DockerClient';
import { MCPAgent } from '../../services/MCPAgent';
import { AgentFactory } from '../../services/factories/AgentFactory';

export class SocketRegistry {
  private agents: Map<string, MCPAgent> = new Map();
  private requestQueues: Map<string, number> = new Map();
  private readonly MAX_REQUESTS_PER_USER = 5; // Phase 2: Backpressure limit

  constructor(
    private io: Server,
    private sessionManager: SessionManager,
    private conversationRepo: ConversationRepository,
    private dockerClient: DockerClient
  ) {}

  /**
   * Handle message with backpressure control.
   * Limits concurrent requests per user to prevent memory explosion.
   */
  private async handleMessageWithBackpressure(
    socket: Socket,
    sessionId: string,
    handler: () => Promise<void>
  ): Promise<void> {
    const queueSize = this.requestQueues.get(socket.id) || 0;

    if (queueSize >= this.MAX_REQUESTS_PER_USER) {
      socket.emit('agent:error', {
        message: `Too many concurrent requests (max: ${this.MAX_REQUESTS_PER_USER}). Please wait for previous requests to complete.`,
        code: 'TOO_MANY_REQUESTS'
      });
      return;
    }

    this.requestQueues.set(socket.id, queueSize + 1);

    try {
      await handler();
    } catch (error) {
      console.error(`[Socket] Error handling request for ${sessionId}:`, error);
      socket.emit('agent:error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'REQUEST_ERROR'
      });
    } finally {
      const currentSize = this.requestQueues.get(socket.id) || 1;
      if (currentSize <= 1) {
        this.requestQueues.delete(socket.id);
      } else {
        this.requestQueues.set(socket.id, currentSize - 1);
      }
    }
  }

  public initialize() {
    this.io.on('connection', async (socket: Socket) => {
      const sessionId = socket.handshake.query.sessionId as string;
      const clientToken = socket.handshake.auth.token;
      const modelName = socket.handshake.query.model as string | undefined;

      if (!sessionId) {
        socket.emit('error', 'Missing sessionId in query params');
        socket.disconnect();
        return;
      }

      console.log(`[Socket] New connection: ${sessionId} with model: ${modelName || 'default'}`);

      try {
        // 1. Acquire Session (Container)
        // We use a default image for now. In future, user could specify.
        const sessionData = await this.sessionManager.acquireSession(sessionId);

        // 2. Initialize Agent
        const agent = AgentFactory.createAgent(
          sessionId,
          sessionData,
          this.conversationRepo,
          this.dockerClient,
          {
            onThinking: () => socket.emit('agent:thinking'),
            onResponse: (text) => socket.emit('agent:response', text),
            onToolApprovalRequired: (name, args, callId, queuePosition, totalInQueue) =>
                socket.emit('tool:approval_required', {
                    name,
                    args,
                    callId,
                    queuePosition: queuePosition || 1,
                    totalInQueue: totalInQueue || 1
                }),
            onToolOutput: (output) => socket.emit('tool:output', output),
            onError: (err) => socket.emit('agent:error', err)
          },
          clientToken,
          modelName
        );

        await agent.initialize();
        this.agents.set(socket.id, agent);

        // 3. Setup Events with Backpressure
        socket.on('message', async (text: string) => {
            await this.handleMessageWithBackpressure(socket, sessionId, async () => {
              await agent.generateResponse(text);
            });
        });

        socket.on('tool:approval', async (data: { callId: string, approved: boolean }) => {
            await this.handleMessageWithBackpressure(socket, sessionId, async () => {
              await agent.executeTool(data.callId, data.approved);
            });
        });

        // Allow users to manually reset conversation history
        socket.on('history:reset', async () => {
          console.log(`[Socket] History reset requested for ${sessionId}`);
          await this.conversationRepo.clearHistory(sessionId);
          socket.emit('system:message', 'Conversation history cleared. Starting fresh.');
        });

        socket.on('disconnect', async () => {
           console.log(`[Socket] Disconnect: ${sessionId}`);
           await agent.cleanup();
           this.agents.delete(socket.id);
           this.requestQueues.delete(socket.id); // Phase 2: Clean up request queue
           // We do NOT terminate the session here, enabling reconnection.
           // The Janitor will clean it up if they don't come back.
        });

        socket.emit('system:ready', {
            sessionId,
            containerId: sessionData.containerId,
            provider: AgentFactory.getProviderType(),
            model: modelName
        });

      } catch (err: any) {
        console.error(`[Socket] Initialization error for ${sessionId}`, err);
        socket.emit('error', `Failed to initialize session: ${err.message}`);
        socket.disconnect();
      }
    });
  }
}
