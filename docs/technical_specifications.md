# Technical Specifications

## 1. Entry Points
- **Bootstrap (`src/index.ts`)**: Initializes infrastructure (Redis, Docker), starts domain services, and binds the Socket interface.
- **SocketRegistry (`src/interfaces/socket/SocketRegistry.ts`)**: The primary real-time entry point.
    - Emits `system:ready` with `{ provider: string, model?: string }` payload for UI customization.
    - Handles connection, authentication tokens, model selection, and event routing (`message`, `tool:approval`).
    - Accepts `model` parameter via socket query for runtime model selection.
- **AgentFactory (`src/services/factories/AgentFactory.ts`)**:
    - `createAgent()`: Instantiates the specific `LLMProvider` based on env vars and optional model parameter.
    - `getProviderType()`: Returns the normalized provider string (e.g., 'gemini', 'claude').
    - Supports runtime model override via constructor parameter.

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
    - `GeminiProvider`: Uses `@google/generative-ai`. Supports runtime model selection (default: gemini-2.0-flash-exp).
    - `ClaudeProvider`: Uses `@anthropic-ai/sdk`. Supports runtime model selection (default: claude-sonnet-4-5-20250929).
    - `OpenAIProvider`: Uses `openai`. Supports runtime model selection (default: gpt-4o).
- **Model Selection**: All providers accept optional `model` parameter in constructor for runtime override.
- **Supported Models**:
    - **Claude**: Sonnet 4.5, Opus 4.6, Haiku 4.5, Claude 3 family
    - **Gemini**: 2.0 Flash, 1.5 Flash, 1.5 Pro
    - **OpenAI**: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo

## 4. Error Matrix
| Failure Scenario | Handling Mechanism | User Impact |
|---|---|---|
| Missing API Key | `AgentFactory` throws Error | Socket emits `error` and disconnects. |
| Redis Down | `RedisFactory` throws Error | Bootstrap fails or session init fails. |
| Tool Execution Error | `try/catch` in `MCPAgent.executeTool` | `onToolError` event emitted to client. |
| Expired Session | `JanitorService` (cron) | Container is pruned, history remains in Redis. |

## 5. MCP Server Implementation
The system includes a production-ready MCP server (`mcp-server/index.js`):
- **Transport**: StdioServerTransport for JSON-RPC communication
- **Tools Implemented**:
    - `read_file`: Read file contents from /workspace
    - `write_file`: Write/create files in /workspace
    - `list_files`: List directory contents
    - `execute_command`: Execute bash commands (30s timeout, /workspace cwd)
- **Isolation**: Each session gets a dedicated container with isolated /workspace
- **Security**: No network access, 512MB RAM limit, 0.5 CPU limit

## 6. API Endpoints
- **GET `/api/models/available`**: Returns models accessible with current API key (dynamic testing, ~5-10s response time)
- **GET `/api/models/check`**: Diagnostic endpoint showing detailed model availability status
- **Static Files**: Served from `/public` directory (Vue.js SPA)

## 7. Complexity Concerns
- **History Load**: O(N) where N is history size. History is capped at 50 messages to prevent token overflow and latency.
- **MCP Transport**: Uses JSON-RPC over stdio via Docker attach. Communication overhead is minimal but dependent on Docker daemon responsiveness.
- **Model Detection**: `/api/models/available` makes real API calls to test each model (~1s per model). Results are not cached.
- **Docker Socket Permissions**: Container runs as `node` user in `docker` group (GID 990) for socket access.
