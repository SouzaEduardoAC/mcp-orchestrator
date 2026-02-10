# Technical Specifications

## 1. System Entry Points
*   **Main Application**: `src/index.ts` (Function: `bootstrap`)
    *   Initializes `RedisFactory`, `DockerClient`, `AppServer`.
    *   Starts `JanitorService` for cleanup.
    *   Binds `SocketRegistry` to HTTP server.
*   **Session Management**: `src/services/SessionManager.ts`
    *   `acquireSession(sessionId)`: Idempotent method. Returns existing session or spawns a new Docker container.
*   **Agent Logic**: `src/services/GeminiAgent.ts`
    *   `generateResponse(prompt)`: Core ReAct loop.
    *   `executeTool(callId)`: Handles approved tool execution via MCP Client.

## 2. State Management & Data Persistence
The system uses **Redis** as the primary source of truth for ephemeral state.

*   **Sessions** (`RedisSessionRepository`):
    *   Key: `session:{id}`
    *   Data: `containerId`, `startTime`, `lastActive`.
    *   Lifecycle: Managed by `SessionManager` and cleaned by `JanitorService`.
*   **Conversations** (`RedisConversationRepository`):
    *   Key: `history:{id}`
    *   Data: List of message objects (`role`, `content`, `timestamp`).
    *   Usage: Re-hydrated by `GeminiAgent` on every request.

## 3. Infrastructure & Transport
*   **Docker Integration**: `src/infrastructure/docker/DockerClient.ts` handles container lifecycle (`spawn`, `stop`, `get`).
*   **MCP Transport**: `src/infrastructure/transport/DockerContainerTransport.ts`
    *   Implements the Model Context Protocol transport layer.
    *   Connects `GeminiAgent` (Host) to `mcp-server` (Container) via `docker exec` streams or similar mechanism.

## 4. Error Handling Matrix
| Component | Failure Mode | Handling Strategy |
|-----------|--------------|-------------------|
| `bootstrap` | Init Failure (Redis/Docker down) | Logs error, `process.exit(1)`. |
| `SessionManager` | Container Spawn Fail | Throws error, propagated to Socket. |
| `GeminiAgent` | Model API Error | Caught in `generateResponse`, emits `onError` event. |
| `GeminiAgent` | Tool Execution Fail | Caught in `executeTool`, emits `onError`, clears pending call. |

## 5. Complexity & Constraints
*   **Context Window**: `GeminiAgent` rebuilds the full chat history for the Gemini API on every turn. Large histories will increase latency and token costs (O(N)).
*   **Concurrency**: `SessionManager` currently lacks distributed locking (marked as `TODO`). Race conditions possible on simultaneous `acquireSession` for the same ID.
*   **Docker Latency**: Container startup (cold start) is the significant bottleneck for new sessions.
