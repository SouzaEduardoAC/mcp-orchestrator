import { Server, Socket } from 'socket.io';
import { SessionManager } from '../../services/SessionManager';
import { ConversationRepository } from '../../domain/conversation/ConversationRepository';
import { DockerClient } from '../../infrastructure/docker/DockerClient';
import { MCPAgent } from '../../services/MCPAgent';
import { AgentFactory } from '../../services/factories/AgentFactory';

export class SocketRegistry {
  private agents: Map<string, MCPAgent> = new Map();

  constructor(
    private io: Server,
    private sessionManager: SessionManager,
    private conversationRepo: ConversationRepository,
    private dockerClient: DockerClient
  ) {}

  public initialize() {
    this.io.on('connection', async (socket: Socket) => {
      const sessionId = socket.handshake.query.sessionId as string;
      const clientToken = socket.handshake.auth.token;

      if (!sessionId) {
        socket.emit('error', 'Missing sessionId in query params');
        socket.disconnect();
        return;
      }

      console.log(`[Socket] New connection: ${sessionId}`);

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
            onToolApprovalRequired: (name, args, callId) => socket.emit('tool:approval_required', { name, args, callId }),
            onToolOutput: (output) => socket.emit('tool:output', output),
            onError: (err) => socket.emit('agent:error', err)
          },
          clientToken
        );

        await agent.initialize();
        this.agents.set(socket.id, agent);

        // 3. Setup Events
        socket.on('message', async (text: string) => {
            await agent.generateResponse(text);
        });

        socket.on('tool:approval', async (data: { callId: string, approved: boolean }) => {
            if (data.approved) {
                await agent.executeTool(data.callId);
            } else {
                // Handle rejection logic if needed
                socket.emit('agent:response', "Tool execution denied by user.");
            }
        });

        socket.on('disconnect', async () => {
           console.log(`[Socket] Disconnect: ${sessionId}`);
           await agent.cleanup();
           this.agents.delete(socket.id);
           // We do NOT terminate the session here, enabling reconnection.
           // The Janitor will clean it up if they don't come back.
        });

        socket.emit('system:ready', { sessionId, containerId: sessionData.containerId });

      } catch (err: any) {
        console.error(`[Socket] Initialization error for ${sessionId}`, err);
        socket.emit('error', `Failed to initialize session: ${err.message}`);
        socket.disconnect();
      }
    });
  }
}
