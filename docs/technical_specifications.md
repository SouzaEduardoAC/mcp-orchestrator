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
    - **ConversationRepository**: Stores message history with token-aware truncation (default: 30k tokens, max 50 messages) (`mcp:conversation:{id}`). Supports optional gzip compression.
- **Docker (Compute)**:
    - Ephemeral containers run MCP servers. The state within the container is isolated per session.
- **Docker Volumes**:
    - **mcp-config volume**: Persists MCP configuration (`mcp-config.json`) and application state across container restarts and rebuilds.

## 3. Provider Architecture
The system uses the **Strategy Pattern** for LLM integration:
- **`LLMProvider` Interface**: Defines `generateResponse(history, prompt, tools)`.
- **Implementations**:
    - `GeminiProvider`: Uses `@google/generative-ai`. Supports runtime model selection (default: gemini-2.0-flash-exp).
    - `ClaudeProvider`: Uses `@anthropic-ai/sdk`. Supports runtime model selection (default: claude-sonnet-4-5-20250929). Configurable `max_tokens` via `MAX_OUTPUT_TOKENS` env var (default: 8192).
    - `OpenAIProvider`: Uses `openai`. Supports runtime model selection (default: gpt-4o).
- **Model Selection**: All providers accept optional `model` parameter in constructor for runtime override.
- **Token Configuration**:
    - `MAX_OUTPUT_TOKENS`: Controls response length (default: 8192 tokens)
    - `MAX_HISTORY_TOKENS`: Controls conversation history size (default: 30000 tokens)
    - `ENABLE_CONVERSATION_COMPRESSION`: Enables gzip compression for history (default: false)
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
| Context Window Overflow | Pre-flight check in `MCPAgent` | Clears history and retries with fresh context. |
| Response Truncation | Configurable `max_tokens` in provider | Increase `MAX_OUTPUT_TOKENS` environment variable. |

## 5. Multiple Tool Call Management

The `MCPAgent` implements a queue-based system for handling multiple tool calls from LLMs:

### Architecture
- **Queue Structure**: Array of tool call objects with status tracking
  ```typescript
  private pendingCalls: Array<{
    id: string;
    name: string;
    args: any;
    status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
    result?: any;
    error?: string;
  }> = [];
  ```

### Workflow
1. **Tool Call Reception** (`generateResponse`):
   - All tool calls from LLM response are stored in queue
   - Each assigned unique ID: `call_${timestamp}_${index}`
   - First tool emitted for approval with position metadata (1 of N)

2. **Sequential Approval** (`executeTool`):
   - Updates tool status: `pending` → `approved` or `rejected`
   - Triggers `processNextOrFinish()` to handle next step
   - Rejected tools are skipped but don't block remaining tools

3. **Queue Processing** (`processNextOrFinish`):
   - Finds next pending tool and emits approval request
   - If no pending tools, triggers parallel execution phase
   - Maintains queue position for UI feedback

4. **Parallel Execution** (`executeApprovedTools`):
   - Uses `Promise.allSettled` for concurrent execution
   - Status transitions: `approved` → `executing` → `completed`/`failed`
   - Error handling: Failed tools don't block others

5. **Result Aggregation** (`finishToolSequence`):
   - Queue cleared **before** sending results to LLM (critical for preserving follow-up tools)
   - Results formatted and sent back for next LLM iteration
   - Supports recursive tool calling (LLM can request more tools based on results)

### Socket Events
- **Emit**: `tool:approval_required` with `{ name, args, callId, queuePosition, totalInQueue }`
- **Receive**: `tool:approval` with `{ callId, approved: boolean }`
- **Emit**: `tool:output` for each completed tool
- **Emit**: `agent:error` for failed tools

### Error Handling
- **No Matching Call**: Emits error if approval received for non-existent callId
- **Execution Failure**: Captured per-tool, doesn't affect other tools in queue
- **Queue Lifecycle**: Cleared on cleanup, on sequence completion, and between sessions

### Performance Characteristics
- **Sequential Approval**: O(N) where N = number of tools (user interaction time)
- **Parallel Execution**: O(1) time complexity for approved tools (concurrent execution)
- **Memory**: O(N) for queue storage, cleared after completion

## 6. MCP Server Implementation
The system includes a production-ready MCP server (`mcp-server/index.js`):
- **Transport**: StdioServerTransport for JSON-RPC communication
- **Tools Implemented**:
    - `read_file`: Read file contents from /workspace
    - `write_file`: Write/create files in /workspace
    - `list_files`: List directory contents
    - `execute_command`: Execute bash commands (30s timeout, /workspace cwd)
- **Isolation**: Each session gets a dedicated container with isolated /workspace
- **Security**: No network access, 512MB RAM limit, 0.5 CPU limit

## 7. API Endpoints
- **GET `/api/models/available`**: Returns models accessible with current API key (dynamic testing, ~5-10s response time)
- **GET `/api/models/check`**: Diagnostic endpoint showing detailed model availability status
- **GET `/api/mcp/health`**: Returns health status for all configured MCPs with summary metrics
- **POST `/api/mcp/add`**: Adds a new MCP server to the registry
  - **Request Body**: `{ name: string, config: MCPServerConfig }`
  - **Validation**: Name format, transport type, transport-specific required fields
  - **Responses**: 201 (success), 400 (validation error), 409 (duplicate), 500 (server error)
  - **Side Effects**: Updates `mcp-config.json`, emits `mcpAdded` event
- **Static Files**: Served from `/public` directory (Vue.js SPA)

## 8. Complexity Concerns
- **History Load**: O(N) where N is history size. History is truncated based on token count (default: 30k tokens) and message count (max: 50). Token estimation uses character-based heuristic (1 token ≈ 4 characters).
- **Token Budget Management**: Total input tokens (history + tools + prompt) validated before LLM call. With many MCPs, tool definitions can consume 80-100k tokens, requiring conservative history limits.
- **MCP Transport**: Uses JSON-RPC over stdio via Docker attach. Communication overhead is minimal but dependent on Docker daemon responsiveness.
- **Model Detection**: `/api/models/available` makes real API calls to test each model (~1s per model). Results are not cached.
- **Docker Socket Permissions**: Container runs as `node` user in `docker` group (GID 990) for socket access.
