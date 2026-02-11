# AI Context: MCP Orchestrator

## Metadata
- **Last Updated**: 2026-02-11
- **Architectural Style**: Modular Monolith with Strategy Pattern (LLM Providers)
- **Primary Tech Stack**: Node.js, TypeScript, Docker, Redis, Socket.io, MCP SDK, Vue.js
- **New Features**: Dynamic model selection, runtime model switching, model availability detection

## Dependency Map
| Import | Role |
|---|---|
| `@modelcontextprotocol/sdk` | Core protocol for tool discovery and execution. |
| `dockerode` | programmatic control of ephemeral tool-execution environments. |
| `redis` | High-speed persistence for sessions and chat history. |
| `socket.io` | Real-time bidirectional communication with clients. |
| `@google/generative-ai` | Gemini 2.0 integration. |
| `@anthropic-ai/sdk` | Claude 3.5 Sonnet integration. |
| `openai` | GPT-4o integration. |

## Machine-Readable Summary
The system is an **MCP-to-LLM bridge** with **runtime model selection**. It abstracts model-specific SDKs behind the `LLMProvider` interface. The `MCPAgent` acts as the orchestrator, managing a 4-way sync between:
1. The Client (via Socket.io with model selection)
2. The LLM (via LLMProvider with dynamic model)
3. The Tool Environment (via DockerContainerTransport with 4 production tools)
4. The State (via Redis)

`LLM_PROVIDER` environment variable dictates the active provider. `model` query parameter (via Socket.io) allows runtime model override. `clientToken` (passed via Socket auth) can override server-side API keys.

The Client UI is **provider and model aware**:
- Fetches available models on load via `/api/models/available` (~5-10s)
- Displays loading screen during model detection
- Shows dropdown with only accessible models
- Receives provider and model info via `system:ready` event
- Supports runtime model switching with automatic reconnection

## MCP Server Details
**Location**: `mcp-server/index.js`
**Transport**: StdioServerTransport (JSON-RPC over stdio)
**Tools**:
- `read_file(path)`: Read file from /workspace
- `write_file(path, content)`: Write/create file in /workspace
- `list_files(path?)`: List directory contents
- `execute_command(command)`: Bash execution (30s timeout, /workspace cwd)

**Security**: Containers run with:
- No network access (NetworkMode: 'none')
- Memory limit: 512MB
- CPU limit: 0.5 cores
- Non-root user (node)
- Isolated /workspace directory
