# AI Context: MCP Orchestrator

## Metadata
- **Last Updated**: 2026-02-13
- **Version**: 1.2.0 (Phases 1-5 Complete + HTTP/SSE Support + Multiple Tool Calls + Token Management)
- **Architectural Style**: Multi-MCP Orchestration with Health Monitoring
- **Primary Tech Stack**: Node.js, TypeScript, Docker, Redis, Socket.io, MCP SDK, Vue.js
- **Key Features**: Multi-MCP support, multiple tool call handling, health monitoring, auto-reconnection, CLI management, web dashboard, HTTP/SSE transports, persistent configuration, configurable token limits, conversation compression

## System Evolution

### Original Design (Pre-Phase 1)
- Single MCP per session
- Direct transport to one container
- Manual container management
- No health monitoring

### Current Design (Post-Phase 5)
- **Multiple MCPs per session** (unlimited)
- **Registry-based configuration** (mcp-config.json with Docker volume persistence)
- **Automatic health monitoring** (60s intervals)
- **Auto-reconnection** with circuit breaker
- **CLI management** (`llm` command with 8 subcommands)
- **Web dashboard** (real-time monitoring and MCP creation)
- **Tool aggregation** from all MCPs
- **Smart namespacing** (auto/prefix/none)
- **Multi-transport support** (stdio-docker, HTTP, SSE, stdio)

## Dependency Map

| Import | Role |
|---|---|
| `@modelcontextprotocol/sdk` | Core protocol for tool discovery and execution |
| `dockerode` | Programmatic control of MCP containers |
| `redis` | Session and chat history persistence |
| `socket.io` | Real-time client communication |
| `@google/generative-ai` | Gemini 2.0 integration |
| `@anthropic-ai/sdk` | Claude 4.5/4.6 integration |
| `openai` | GPT-4o integration |
| `commander` | CLI framework |
| `inquirer` | Interactive CLI prompts |
| `chalk` | Terminal colors |
| `ora` | CLI spinners |
| `cli-table3` | CLI tables |

## Machine-Readable Summary

The system is a **Multi-MCP Orchestration Platform** with health monitoring and management. It connects LLMs to multiple MCP servers simultaneously, aggregates their tools, and provides resilience through automatic health checks and reconnection.

### 7-way Orchestration:
1. **Client** (via Socket.io with model selection)
2. **LLM Provider** (Claude/Gemini/OpenAI with dynamic model)
3. **MCPConnectionManager** (aggregates multiple MCPs)
4. **MCPHealthMonitor** (monitors and auto-reconnects)
5. **MCPRegistry** (configuration management)
6. **Multiple MCP Servers** (Docker/HTTP/stdio)
7. **Redis State** (sessions and history)

### Architecture Flow:
```
User → Web UI → Socket.IO → MCPAgent
                              ↓
                    MCPConnectionManager
                     (Tool Aggregation)
                              ↓
              MCPHealthMonitor (Monitoring)
                              ↓
                ┌─────────────┼─────────────┐
                │             │             │
              MCP 1         MCP 2         MCP 3
            (Docker)      (Docker)       (HTTP)
```

## Core Components

### MCPConnectionManager (`src/services/MCPConnectionManager.ts`)
**Purpose**: Manages multiple MCP connections simultaneously

**Key Methods**:
- `initialize()` - Connects to all enabled MCPs from registry
- `getAllTools()` - Aggregates tools with namespacing
- `executeTool(name, args)` - Routes tool calls to correct MCP
- `checkHealth(mcpName)` - Tests MCP connection
- `reconnect(mcpName)` - Reconnects to failed MCP
- `cleanup()` - Disconnects all MCPs

**Namespacing**:
- `auto`: Prefix only when multiple MCPs connected
- `prefix`: Always apply MCP name prefix
- `none`: No prefixing (conflicts possible)

### MCPHealthMonitor (`src/services/MCPHealthMonitor.ts`)
**Purpose**: Event-driven health monitoring with auto-recovery

**Features**:
- Periodic health checks (60s default)
- Circuit breaker pattern (3 failure threshold)
- Automatic reconnection (5 max attempts)
- Exponential backoff (5s delay)
- Event emitters for status changes

**Status Types**:
- `healthy`: All checks passing
- `unhealthy`: Checks failing (< 3 consecutive)
- `reconnecting`: Attempting recovery
- `disconnected`: Max retries reached

**Events**:
- `health-changed` - Status update
- `mcp-unhealthy` - MCP failure detected
- `mcp-healthy` - MCP recovered
- `reconnect-attempt` - Reconnection started
- `reconnect-success` - Reconnection succeeded
- `reconnect-failed` - Reconnection failed

### MCPRegistry (`src/registry/MCPRegistry.ts`)
**Purpose**: Configuration management and CRUD operations

**Methods**:
- `addMCP(name, config)` - Register new MCP
- `removeMCP(name)` - Unregister MCP
- `enableMCP(name)` / `disableMCP(name)` - Toggle MCPs
- `getMCP(name)` - Get configuration
- `getEnabledMCPs()` - Get all enabled MCPs

**Configuration File**: `mcp-config.json`
```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio-docker",
      "containerImage": "mcp-server:latest",
      "enabled": true,
      "description": "File system operations",
      "toolPrefix": "fs"
    }
  },
  "settings": {
    "autoConnect": true,
    "healthCheckInterval": 60000,
    "toolNamespacing": "auto"
  }
}
```

### MCPAgent Tool Call Queue (`src/services/MCPAgent.ts`)
**Purpose**: Manages multiple tool calls from LLMs with sequential approval and parallel execution

**Architecture**:
```typescript
private pendingCalls: Array<{
  id: string;                    // Unique identifier
  name: string;                  // Tool name
  args: any;                     // Tool arguments
  status: 'pending' | 'approved' | 'rejected' |
          'executing' | 'completed' | 'failed';
  result?: any;                  // Execution result
  error?: string;                // Error message if failed
}> = [];
```

**Workflow**:
1. **Reception**: Store all tool calls with unique IDs
2. **Sequential Approval**: Present tools one at a time (1 of N, 2 of N)
3. **Queue Processing**: Track approved/rejected status
4. **Parallel Execution**: Execute approved tools concurrently
5. **Result Aggregation**: Collect and send results to LLM
6. **Follow-up Support**: Queue cleared before LLM response to preserve new tool calls

**Key Methods**:
- `executeTool(callId, approved)` - Process approval decision
- `processNextOrFinish()` - Handle next tool or trigger execution
- `executeApprovedTools()` - Parallel execution with Promise.allSettled
- `finishToolSequence()` - Aggregate results and clear queue

**Benefits**:
- User control with individual approval
- Performance through parallel execution
- Reliability with proper queue lifecycle management
- Transparency with progress indicators

### CLI Tool (`src/cli/`)
**Purpose**: Command-line interface for MCP management

**Commands**:
```bash
llm mcp list [--enabled] [--format json]
llm mcp add [name] [--transport <type>] [options]
llm mcp remove <name> [--yes]
llm mcp enable <name>
llm mcp disable <name>
llm mcp test <name>
llm mcp info <name>
llm mcp health
```

**Structure**:
- `cli/index.ts` - Commander.js setup
- `cli/commands/mcp/*.ts` - Command implementations
- `cli/utils/display.ts` - Chalk formatting
- `cli/utils/prompts.ts` - Inquirer prompts

### Web Dashboard (`public/index.html`)
**Purpose**: Visual monitoring and management interface

**Features**:
- **Chat Tab**: LLM conversation with tool approval
- **MCP Management Tab**:
  - Summary cards (Total, Healthy, Issues)
  - **Add MCP Button**: Create new MCP servers via web form
  - Real-time MCP list with status
  - Health indicators (✓ ⚠ ↻ ✗)
  - Last check/success timestamps
  - Error messages and failure counts
  - Manual refresh button

**Add MCP Modal**:
- Full-screen modal form with dynamic fields
- Transport type selector (HTTP, SSE, Stdio, Stdio-Docker)
- Transport-specific fields (URL, command, container image)
- Custom headers support (HTTP/SSE)
- Resource limits configuration (Stdio-Docker)
- Client-side validation matching CLI patterns
- Error display and loading states

**Technology**: Vue 3 Composition API, TailwindCSS

## Transport Types

### stdio-docker
Spawns Docker container with stdio communication:
```typescript
{
  transport: "stdio-docker",
  containerImage: "mcp-server:latest",
  containerEnv: { VAR: "value" },
  containerMemory: 512,  // MB
  containerCpu: 0.5      // cores
}
```

### http/sse
HTTP REST or Server-Sent Events:
```typescript
{
  transport: "sse",
  url: "http://mcp-server:8080/sse",  // Note: SSE servers often require /sse path
  headers: { Authorization: "Bearer ${API_KEY}" },
  healthCheckEndpoint: "/health",
  timeout: 30000
}
```

**Important**: SSE-based MCP servers typically require a specific endpoint path (e.g., `/sse`). Verify the correct URL with your MCP server documentation.

### stdio
Local process via stdin/stdout:
```typescript
{
  transport: "stdio",
  command: "node",
  args: ["dist/server.js"],
  env: { NODE_ENV: "production" },
  cwd: "/app"
}
```

## API Endpoints

### GET /api/mcp/health
Returns health status for all MCPs:
```json
{
  "summary": {
    "total": 1,
    "healthy": 1,
    "unhealthy": 0,
    "reconnecting": 0,
    "disconnected": 0
  },
  "mcps": [{
    "name": "filesystem",
    "status": "healthy",
    "lastCheck": 1770827144464,
    "lastSuccess": 1770827144464,
    "consecutiveFailures": 0
  }]
}
```

### POST /api/mcp/add
Adds a new MCP server to the registry:

**Request**:
```json
{
  "name": "my-mcp",
  "config": {
    "transport": "http",
    "url": "https://example.com/mcp",
    "enabled": true,
    "description": "My MCP server"
  }
}
```

**Validation**:
- Name: `/^[a-zA-Z0-9-_]+$/`
- Transport: `http | sse | stdio | stdio-docker`
- HTTP/SSE: requires `url` (must start with `http://` or `https://`)
- Stdio: requires `command`
- Stdio-Docker: requires `containerImage`

**Responses**:
- `201`: Success - `{"message": "MCP server added successfully", "name": "my-mcp"}`
- `400`: Validation error
- `409`: Duplicate MCP name
- `500`: Server error

### GET /api/models/available
Returns accessible LLM models based on API key

### GET /api/models/check
Diagnostic endpoint for model availability testing

## MCP Server Details

**Default Server**: `mcp-server/index.js`
**Transport**: StdioServerTransport (JSON-RPC over stdio)

**Tools**:
- `read_file(path)` - Read file from /workspace
- `write_file(path, content)` - Write/create file
- `list_files(path?)` - List directory contents
- `execute_command(command)` - Bash execution (30s timeout)

**Security**:
- No network access (NetworkMode: 'none')
- Memory limit: 512MB
- CPU limit: 0.5 cores
- Non-root user (node)
- Isolated /workspace directory

## TypeScript Types

### MCPServerConfig
```typescript
type TransportType = 'http' | 'stdio' | 'sse' | 'stdio-docker';
type NamespacingStrategy = 'auto' | 'prefix' | 'none';

interface MCPServerConfigBase {
  transport: TransportType;
  enabled: boolean;
  description?: string;
  toolPrefix?: string;
}

interface StdioDockerMCPConfig extends MCPServerConfigBase {
  transport: 'stdio-docker';
  containerImage: string;
  containerEnv?: Record<string, string>;
  containerMemory?: number;
  containerCpu?: number;
}
```

### MCPHealth
```typescript
type MCPHealthStatus = 'healthy' | 'unhealthy' | 'reconnecting' | 'disconnected';

interface MCPHealth {
  name: string;
  status: MCPHealthStatus;
  lastCheck: number;
  lastSuccess: number;
  consecutiveFailures: number;
  error?: string;
}
```

## Implementation Phases

### Phase 1: Core Infrastructure ✅
- Configuration management (ConfigStore, MCPRegistry)
- Transport abstraction (MCPTransport, TransportFactory)
- Multi-transport support (HTTP, stdio, Docker)

### Phase 2: CLI Tool ✅
- Commander.js framework
- 8 management commands
- Interactive prompts
- Pretty output (Chalk, tables, spinners)

### Phase 3: Multi-MCP Integration ✅
- MCPConnectionManager
- Tool aggregation with namespacing
- Smart tool routing
- Dynamic MCP loading

### Phase 4: Health Monitoring ✅
- MCPHealthMonitor service
- Periodic health checks
- Auto-reconnection with backoff
- Circuit breaker pattern
- Event-driven architecture

### Phase 5: Web UI ✅
- Tabbed interface (Chat + Management)
- Real-time health dashboard
- Summary cards and MCP list
- **Add MCP modal form** (all transport types)
- Status indicators and timestamps
- CLI quick start guide
- API endpoint for adding MCPs (`POST /api/mcp/add`)

## Project Structure

```
src/
├── cli/                      # CLI tool (Phase 2)
│   ├── commands/mcp/         # 8 management commands
│   ├── utils/                # Display and prompts
│   └── index.ts              # Commander.js entry
├── registry/                 # Configuration (Phase 1)
│   ├── types.ts              # TypeScript types
│   ├── ConfigStore.ts        # File I/O
│   └── MCPRegistry.ts        # CRUD operations
├── transports/               # Transport layer (Phase 1)
│   ├── base/MCPTransport.ts  # Base interface
│   ├── HttpTransport.ts      # HTTP/REST
│   ├── StdioTransport.ts     # Local stdio
│   ├── StdioDockerTransport.ts # Docker stdio
│   └── TransportFactory.ts   # Factory pattern
├── services/                 # Business logic
│   ├── MCPAgent.ts           # Main orchestrator
│   ├── MCPConnectionManager.ts # Multi-MCP (Phase 3)
│   ├── MCPHealthMonitor.ts   # Health monitoring (Phase 4)
│   └── SessionManager.ts     # Session lifecycle
├── interfaces/llm/           # LLM providers
│   ├── LLMProvider.ts        # Base interface
│   ├── ClaudeProvider.ts     # Anthropic Claude
│   ├── GeminiProvider.ts     # Google Gemini
│   └── OpenAIProvider.ts     # OpenAI GPT
├── infrastructure/
│   ├── docker/               # Docker client
│   ├── http/                 # HTTP & Socket.IO server
│   └── transport/            # Legacy transport
└── domain/
    ├── conversation/         # Chat history
    └── session/              # Session repository

public/
└── index.html                # Vue 3 UI (Phase 5)

mcp-config.json               # MCP configuration
docker-compose.yml            # Services orchestration
Dockerfile                    # Main app container
Dockerfile.mcp                # Default MCP server
```

## Common Operations

### Adding MCP

**Via Web UI** (Recommended):
1. Open http://localhost:3000
2. Click "🔧 MCP Management" tab
3. Click "+ Add MCP" button
4. Fill form and submit

**Via CLI**:
```bash
# Interactive
llm mcp add

# CLI flags
llm mcp add my-server \
  --transport stdio-docker \
  --image mcp-server:latest \
  --description "Custom MCP"
```

**Via API**:
```bash
curl -X POST http://localhost:3000/api/mcp/add \
  -H "Content-Type: application/json" \
  -d '{"name":"my-mcp","config":{"transport":"http","url":"https://example.com","enabled":true}}'
```

### Monitoring Health
```bash
# CLI
llm mcp health

# API
curl http://localhost:3000/api/mcp/health

# Web UI
http://localhost:3000 → Click "🔧 MCP Management"
```

### Troubleshooting
```bash
llm mcp test <name>      # Test connection
llm mcp info <name>      # View configuration
docker logs <container>   # Check container logs
docker ps                 # List running containers
```

## Security Model

1. **Container Isolation**: Each MCP in separate Docker container
2. **Resource Limits**: Memory (512MB) and CPU (0.5) constraints
3. **Network Isolation**: Containers run without network by default
4. **Environment Variables**: Secure interpolation (${VAR})
5. **Tool Approval**: Human-in-the-loop for sensitive operations
6. **Session Isolation**: Unique workspace per user

## Token Management

### Configuration
The system manages token usage to prevent context window overflow and response truncation:

**Environment Variables**:
```env
MAX_OUTPUT_TOKENS=8192      # Max tokens for LLM responses (default: 8192)
MAX_HISTORY_TOKENS=30000    # Max tokens in conversation history (default: 30000)
ENABLE_CONVERSATION_COMPRESSION=true  # Compress history with gzip (60-80% reduction)
HISTORY_TTL_SECONDS=86400   # Redis TTL for history keys (default: 24h)
```

### Token Budget (200k Context Window)
With multiple MCPs connected, the token allocation is:
- **History**: 30k tokens (configurable, kept recent)
- **Tool Definitions**: 80-100k tokens (MCP tool schemas)
- **Current Prompt**: 5-10k tokens (user input)
- **Response Buffer**: 5k tokens (safety margin)
- **Headroom**: ~55k tokens

### Implementation

**ConversationRepository** (`src/domain/conversation/ConversationRepository.ts`):
- Token-aware truncation (keeps most recent messages within limit)
- Optional gzip compression (60-80% memory savings)
- Automatic expiration (24h TTL by default)
- Fast token estimation (1 token ≈ 4 characters heuristic)

**MCPAgent** (`src/services/MCPAgent.ts`):
- Pre-flight validation (checks total tokens before sending to LLM)
- Automatic recovery (clears history if context window exceeded)
- Token usage logging (history, prompt, tools, total, utilization %)
- Fallback to fresh context on overflow

**TokenCounter** (`src/utils/TokenCounter.ts`):
- Character-based estimation (4 chars ≈ 1 token)
- Accounts for message content, tool calls, tool responses
- Fast approximation (no external tokenizer needed)

### Troubleshooting

**"prompt is too long" error (218k > 200k)**:
- Root cause: History + tool definitions + prompt exceeds context window
- Solution: Reduce MAX_HISTORY_TOKENS or disable unused MCPs
- Automatic: System clears history and retries with fresh context

**Response truncation (cut off mid-sentence)**:
- Root cause: MAX_OUTPUT_TOKENS too low (was 1024)
- Solution: Increased to 8192 (Claude Sonnet 4.5 maximum)
- Configurable: Adjust via MAX_OUTPUT_TOKENS environment variable

### Token Estimation Accuracy
The character-based heuristic (4 chars = 1 token) provides:
- ✅ Fast estimation without external dependencies
- ✅ Good enough for history management
- ⚠️ May underestimate for JSON/code (densely packed)
- ⚠️ May overestimate for natural language (whitespace)

For precise token counting, consider integrating `tiktoken` library.

## Performance Characteristics

- Health check interval: 60s (configurable)
- Reconnection delay: 5s per attempt
- Max reconnection attempts: 5
- Circuit breaker threshold: 3 failures
- Container memory: 512MB (configurable)
- Container CPU: 0.5 cores (configurable)
- Tool execution timeout: 30s
- **Token limits**: 8192 output, 30000 history (configurable)
- **Context window**: 200k tokens (Claude Sonnet 4.5)

## Extension Points

### Adding New Transport
1. Extend `MCPTransport` base class
2. Implement required methods
3. Add to `TransportFactory`
4. Update type definitions

### Custom Health Checks
Modify `MCPHealthMonitor` parameters:
- `healthCheckInterval` - Check frequency
- `maxConsecutiveFailures` - Circuit breaker threshold
- `maxReconnectAttempts` - Retry limit
- `reconnectDelay` - Backoff duration

### Custom MCP Servers
1. Implement MCP protocol
2. Package as Docker image or HTTP service
3. Register via CLI: `llm mcp add`
4. Configure transport and options

## Best Practices

1. **Use health monitoring**: Enable auto-reconnection
2. **Configure resource limits**: Prevent resource exhaustion
3. **Apply tool prefixes**: Avoid name conflicts
4. **Monitor dashboard**: Regular health checks
5. **Test before deploying**: Use `llm mcp test`
6. **Review logs**: Check for connection issues
7. **Backup configuration**: Version control mcp-config.json
8. **Secure secrets**: Use environment variables

---

**System Status**: Production Ready (All 5 Phases Complete + Multiple Tool Call Support + Token Management)
**Last Updated**: 2026-02-13
**Version**: 1.2.0
