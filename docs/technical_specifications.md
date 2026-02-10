# Technical Specifications

## 1. Entry Points
- **Bootstrap (`src/index.ts`)**: Initializes infrastructure (Redis, Docker), starts domain services, and binds the Socket interface.
- **SocketRegistry (`src/interfaces/socket/SocketRegistry.ts`)**: The primary real-time entry point. Handles connection, authentication tokens, and event routing (`message`, `tool:approval`).
- **AgentFactory (`src/services/factories/AgentFactory.ts`)**: Static factory that determines which `LLMProvider` implementation to use based on the `LLM_PROVIDER` environment variable.

## 2. State Changes & Persistence
- **Redis (Cache/Store)**:
    - **SessionRepository**: Tracks container metadata and heartbeat (`mcp:session:{id}`).
    - **ConversationRepository**: Stores message history as a sliding window (max 50 messages) (`mcp:conversation:{id}`).
- **Docker (Compute)**:
    - Ephemeral containers run MCP servers. The state within the container is isolated per session.

## 3. Provider Architecture
The system uses the **Strategy Pattern** for LLM integration:
- **`LLMProvider` Interface**: Defines `generateResponse(history, prompt, tools)`.
- **Implementations**:
    - `GeminiProvider`: Uses `@google/generative-ai`.
    - `ClaudeProvider`: Uses `@anthropic-ai/sdk`.
    - `OpenAIProvider`: Uses `openai`.

## 4. Error Matrix
| Failure Scenario | Handling Mechanism | User Impact |
|---|---|---|
| Missing API Key | `AgentFactory` throws Error | Socket emits `error` and disconnects. |
| Redis Down | `RedisFactory` throws Error | Bootstrap fails or session init fails. |
| Tool Execution Error | `try/catch` in `MCPAgent.executeTool` | `onToolError` event emitted to client. |
| Expired Session | `JanitorService` (cron) | Container is pruned, history remains in Redis. |

## 5. Complexity Concerns
- **History Load**: O(N) where N is history size. History is capped at 50 messages to prevent token overflow and latency.
- **MCP Transport**: Uses JSON-RPC over `docker exec`. Communication overhead is minimal but dependent on Docker daemon responsiveness.
