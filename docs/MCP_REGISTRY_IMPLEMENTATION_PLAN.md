# MCP Registry Implementation Plan

> **Goal**: Build a dynamic MCP server registry system similar to Claude CLI, allowing users to add/remove/manage multiple MCP servers through a `llm` CLI command.

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Configuration Format](#configuration-format)
3. [File Structure](#file-structure)
4. [Implementation Phases](#implementation-phases)
5. [CLI Commands Specification](#cli-commands-specification)
6. [Transport Layer](#transport-layer)
7. [Registry Service](#registry-service)
8. [Integration Changes](#integration-changes)
9. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

### Current State
```
User/Session → Orchestrator → Single MCP Container (file operations)
```

### Target State
```
User/Session → Orchestrator → MCP Registry → Multiple MCP Servers
                                             ├─ Filesystem MCP (stdio)
                                             ├─ Azure DevOps MCP (http)
                                             ├─ Web Tools MCP (http)
                                             └─ Database MCP (http)
```

### Key Components

1. **MCP Registry Service**: Manages registered MCP server configurations
2. **Configuration Storage**: JSON file (`mcp-config.json`) - portable, version-controlled
3. **Transport Adapters**: Support HTTP, stdio, and SSE transports
4. **CLI Tool**: `llm` command for managing MCPs
5. **MCPAgent Updates**: Connect to multiple MCPs, aggregate tools, route calls

---

## Configuration Format

### File: `mcp-config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio",
      "command": "node",
      "args": ["./mcp-server/index.js"],
      "enabled": true,
      "description": "Local file system operations",
      "env": {
        "WORKSPACE_PATH": "/workspace"
      }
    },
    "azure-devops": {
      "transport": "http",
      "url": "http://localhost:8080",
      "enabled": true,
      "description": "Azure DevOps integration",
      "headers": {
        "Authorization": "Bearer ${AZURE_TOKEN}"
      },
      "healthCheckEndpoint": "/health"
    },
    "web-tools": {
      "transport": "http",
      "url": "http://localhost:5000",
      "enabled": false,
      "description": "Web scraping and API tools"
    },
    "docker-mcp": {
      "transport": "stdio-docker",
      "containerImage": "mcp-custom:latest",
      "enabled": true,
      "description": "Custom Docker-based MCP"
    }
  },
  "settings": {
    "autoConnect": true,
    "healthCheckInterval": 60000,
    "toolNamespacing": "auto"
  }
}
```

### Configuration Schema

```typescript
interface MCPServerConfig {
  // Common fields
  transport: 'http' | 'stdio' | 'sse' | 'stdio-docker';
  enabled: boolean;
  description?: string;

  // HTTP/SSE specific
  url?: string;
  headers?: Record<string, string>;
  healthCheckEndpoint?: string;
  timeout?: number;

  // Stdio specific
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;

  // Stdio-Docker specific
  containerImage?: string;
  containerEnv?: Record<string, string>;

  // Tool namespacing
  toolPrefix?: string; // e.g., "azure" → tools become "azure:create_work_item"
}

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
  settings: {
    autoConnect: boolean;
    healthCheckInterval: number;
    toolNamespacing: 'auto' | 'prefix' | 'none';
  };
}
```

---

## File Structure

```
mcp-orchestrator/
├── mcp-config.json                    # MCP registry configuration
├── bin/
│   └── llm.js                         # CLI entry point (chmod +x)
├── src/
│   ├── cli/
│   │   ├── index.ts                   # CLI app main
│   │   ├── commands/
│   │   │   ├── mcp/
│   │   │   │   ├── add.ts             # llm mcp add
│   │   │   │   ├── list.ts            # llm mcp list
│   │   │   │   ├── remove.ts          # llm mcp remove
│   │   │   │   ├── enable.ts          # llm mcp enable
│   │   │   │   ├── disable.ts         # llm mcp disable
│   │   │   │   ├── test.ts            # llm mcp test
│   │   │   │   └── info.ts            # llm mcp info <name>
│   │   └── utils/
│   │       ├── prompts.ts             # Interactive prompts
│   │       └── display.ts             # Pretty output formatting
│   ├── registry/
│   │   ├── MCPRegistry.ts             # Core registry service
│   │   ├── ConfigStore.ts             # JSON file I/O
│   │   └── HealthMonitor.ts           # Health checking service
│   ├── transports/
│   │   ├── base/
│   │   │   └── Transport.ts           # Base transport interface
│   │   ├── HttpTransport.ts           # HTTP/REST transport
│   │   ├── StdioTransport.ts          # Stdio process transport
│   │   ├── SSETransport.ts            # Server-Sent Events transport
│   │   ├── StdioDockerTransport.ts    # Stdio via Docker (current)
│   │   └── TransportFactory.ts        # Factory for creating transports
│   └── services/
│       └── MultiMCPAgent.ts           # Enhanced MCPAgent for multiple MCPs
├── package.json                       # Add "bin": { "llm": "./bin/llm.js" }
└── docs/
    └── MCP_REGISTRY_IMPLEMENTATION_PLAN.md
```

---

## Implementation Phases

### Phase 1: Core Infrastructure ⚡ (Priority)

**Goal**: Build the foundation - configuration storage, registry service, and transport layer.

#### Tasks:
1. **Create Configuration Schema & Validation**
   - Define TypeScript interfaces
   - Add JSON schema validation
   - Create default config file

2. **Build ConfigStore Service**
   - Read/write `mcp-config.json`
   - Validate configuration
   - Handle file locking for concurrent access
   - Environment variable interpolation (e.g., `${AZURE_TOKEN}`)

3. **Implement MCPRegistry Service**
   - CRUD operations for MCP configs
   - Get all enabled MCPs
   - Validate MCP config before saving
   - Event emitter for config changes

4. **Build Transport Adapters**
   - `HttpTransport`: HTTP/REST with retry logic
   - `StdioTransport`: Local process communication
   - `SSETransport`: Server-Sent Events
   - `StdioDockerTransport`: Refactor existing Docker transport
   - `TransportFactory`: Create transports from config

**Files to Create**:
- `src/registry/ConfigStore.ts`
- `src/registry/MCPRegistry.ts`
- `src/registry/HealthMonitor.ts`
- `src/transports/base/Transport.ts`
- `src/transports/HttpTransport.ts`
- `src/transports/StdioTransport.ts`
- `src/transports/SSETransport.ts`
- `src/transports/TransportFactory.ts`
- `mcp-config.json` (default config)

**Deliverables**:
- ✅ Configuration file format defined
- ✅ Registry can load/save MCP configs
- ✅ Transport adapters can connect to MCP servers
- ✅ Health checking works

---

### Phase 2: CLI Tool 🛠️

**Goal**: Create the `llm` CLI command for managing MCPs.

#### Tasks:
1. **Set Up CLI Framework**
   - Install dependencies: `commander`, `inquirer`, `chalk`, `ora`
   - Create bin script with shebang
   - Configure package.json bin

2. **Implement Commands**
   - `llm mcp add`: Interactive or flag-based MCP addition
   - `llm mcp list`: Pretty-print registered MCPs with status
   - `llm mcp remove <name>`: Remove an MCP
   - `llm mcp enable <name>`: Enable a disabled MCP
   - `llm mcp disable <name>`: Disable an MCP
   - `llm mcp test <name>`: Test connection to MCP
   - `llm mcp info <name>`: Show detailed MCP info and tools

3. **Interactive Prompts**
   - Transport type selection
   - Dynamic form based on transport (URL for HTTP, command for stdio)
   - Confirmation prompts
   - Validation

**Files to Create**:
- `bin/llm.js`
- `src/cli/index.ts`
- `src/cli/commands/mcp/add.ts`
- `src/cli/commands/mcp/list.ts`
- `src/cli/commands/mcp/remove.ts`
- `src/cli/commands/mcp/enable.ts`
- `src/cli/commands/mcp/disable.ts`
- `src/cli/commands/mcp/test.ts`
- `src/cli/commands/mcp/info.ts`
- `src/cli/utils/prompts.ts`
- `src/cli/utils/display.ts`

**Deliverables**:
- ✅ `llm` command globally accessible
- ✅ All commands functional
- ✅ Interactive and non-interactive modes
- ✅ Beautiful CLI output with colors and spinners

---

### Phase 3: Multi-MCP Integration 🔌

**Goal**: Update orchestrator to connect to multiple MCPs and route tool calls.

#### Tasks:
1. **Create MultiMCPAgent**
   - Replaces/extends current MCPAgent
   - Connects to all enabled MCPs from registry
   - Aggregates tools from all MCPs
   - Routes tool calls to correct MCP
   - Handles tool name conflicts

2. **Tool Aggregation**
   - Fetch tools from all connected MCPs
   - Apply namespacing (auto, prefix, or none)
   - Merge into single tool list for LLM
   - Track which tool belongs to which MCP

3. **Tool Routing**
   - Parse tool name (handle namespacing)
   - Route to correct MCP client
   - Execute tool call
   - Return result to LLM

4. **Update SessionManager**
   - Instead of spawning single container, connect to registry MCPs
   - Handle MCP connection failures gracefully
   - Fallback mechanisms

5. **Update SocketRegistry**
   - Use MultiMCPAgent instead of MCPAgent
   - Send list of connected MCPs to client on `system:ready`

**Files to Modify/Create**:
- `src/services/MultiMCPAgent.ts` (new)
- `src/services/SessionManager.ts` (modify)
- `src/interfaces/socket/SocketRegistry.ts` (modify)
- `src/services/MCPAgent.ts` (keep for backward compatibility or migrate)

**Deliverables**:
- ✅ Sessions connect to multiple MCPs
- ✅ Tools from all MCPs available to LLM
- ✅ Tool calls route correctly
- ✅ Error handling for MCP failures

---

### Phase 4: Health Monitoring & Resilience 🏥

**Goal**: Ensure system is robust with health checks and error recovery.

#### Tasks:
1. **Health Check Service**
   - Periodic health checks for all MCPs
   - Update MCP status in registry
   - Emit events on status changes

2. **Reconnection Logic**
   - Auto-reconnect on MCP failure
   - Exponential backoff
   - Circuit breaker pattern

3. **Graceful Degradation**
   - If an MCP is down, continue with available MCPs
   - Notify user which tools are unavailable
   - Queue tool calls for retry when MCP comes back

4. **Monitoring Dashboard** (Optional)
   - Add `/api/mcp/status` endpoint
   - Return health of all registered MCPs
   - Tool availability status

**Files to Create/Modify**:
- `src/registry/HealthMonitor.ts`
- `src/infrastructure/http/Server.ts` (add endpoints)

**Deliverables**:
- ✅ Health monitoring active
- ✅ Auto-reconnection works
- ✅ System resilient to MCP failures

---

### Phase 5: Web UI (Optional) 🎨

**Goal**: Visual MCP management interface.

#### Tasks:
1. **Settings Page**
   - List all MCPs with status indicators
   - Add/Edit/Remove forms
   - Enable/Disable toggles
   - Test connection button

2. **API Endpoints**
   - `GET /api/mcp/list`: List all MCPs
   - `POST /api/mcp/add`: Add new MCP
   - `PUT /api/mcp/update/:name`: Update MCP config
   - `DELETE /api/mcp/remove/:name`: Remove MCP
   - `POST /api/mcp/test/:name`: Test MCP connection
   - `GET /api/mcp/status`: Health status of all MCPs

3. **Real-time Updates**
   - WebSocket events for MCP status changes
   - Live health indicators

**Files to Create/Modify**:
- `public/settings.html` (or add to index.html)
- `src/infrastructure/http/Server.ts` (add endpoints)

**Deliverables**:
- ✅ Web UI for MCP management
- ✅ Real-time status updates
- ✅ User-friendly forms

---

## CLI Commands Specification

### Command Structure
```bash
llm mcp <command> [options]
```

### Commands

#### 1. `llm mcp add`
Add a new MCP server to the registry.

**Interactive Mode**:
```bash
llm mcp add
# Prompts:
# - Name: azure-devops
# - Description: Azure DevOps integration
# - Transport: [http, stdio, sse, stdio-docker]
# - (Dynamic fields based on transport)
```

**Non-Interactive Mode**:
```bash
# HTTP Transport
llm mcp add azure-devops \
  --transport http \
  --url http://localhost:8080 \
  --description "Azure DevOps integration" \
  --header "Authorization=Bearer ${AZURE_TOKEN}"

# Stdio Transport
llm mcp add filesystem \
  --transport stdio \
  --command node \
  --args "./mcp-server/index.js" \
  --description "File system operations"

# Stdio-Docker Transport
llm mcp add custom-mcp \
  --transport stdio-docker \
  --image mcp-custom:latest \
  --description "Custom Docker MCP"
```

#### 2. `llm mcp list`
List all registered MCP servers.

```bash
llm mcp list

# Output:
# ┌─────────────────┬────────────┬───────────┬─────────────────────────────┐
# │ Name            │ Transport  │ Status    │ Description                 │
# ├─────────────────┼────────────┼───────────┼─────────────────────────────┤
# │ filesystem      │ stdio      │ ✓ Online  │ File system operations      │
# │ azure-devops    │ http       │ ✓ Online  │ Azure DevOps integration    │
# │ web-tools       │ http       │ ✗ Offline │ Web scraping tools          │
# │ database        │ http       │ ⊘ Disabled│ Database operations         │
# └─────────────────┴────────────┴───────────┴─────────────────────────────┘
```

**Options**:
```bash
llm mcp list --format json    # JSON output
llm mcp list --enabled        # Show only enabled MCPs
llm mcp list --status online  # Filter by status
```

#### 3. `llm mcp remove <name>`
Remove an MCP server from the registry.

```bash
llm mcp remove azure-devops

# With confirmation:
# Are you sure you want to remove 'azure-devops'? (y/N)

# Skip confirmation:
llm mcp remove azure-devops --yes
```

#### 4. `llm mcp enable <name>`
Enable a disabled MCP server.

```bash
llm mcp enable web-tools
# ✓ Enabled 'web-tools'
```

#### 5. `llm mcp disable <name>`
Disable an MCP server without removing it.

```bash
llm mcp disable database
# ✓ Disabled 'database'
```

#### 6. `llm mcp test <name>`
Test connection to an MCP server.

```bash
llm mcp test azure-devops

# Output:
# Testing connection to 'azure-devops'...
# ✓ Connection successful
# ✓ Health check passed
# Available tools (12):
#   - create_work_item
#   - update_work_item
#   - list_work_items
#   ...
```

#### 7. `llm mcp info <name>`
Show detailed information about an MCP server.

```bash
llm mcp info azure-devops

# Output:
# Name: azure-devops
# Description: Azure DevOps integration
# Transport: http
# URL: http://localhost:8080
# Status: ✓ Online
# Enabled: Yes
# Last Health Check: 2026-02-11 14:30:45
#
# Available Tools (12):
#   - create_work_item: Create a new work item
#   - update_work_item: Update an existing work item
#   ...
```

---

## Transport Layer

### Transport Interface

```typescript
// src/transports/base/Transport.ts
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export interface MCPTransport {
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Communication
  send(message: JSONRPCMessage): Promise<void>;
  onMessage(handler: (message: JSONRPCMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;

  // Health
  healthCheck(): Promise<boolean>;

  // Metadata
  getInfo(): TransportInfo;
}

export interface TransportInfo {
  type: 'http' | 'stdio' | 'sse' | 'stdio-docker';
  endpoint?: string;
  pid?: number;
  containerId?: string;
}
```

### HTTP Transport Implementation

```typescript
// src/transports/HttpTransport.ts
export class HttpTransport implements MCPTransport {
  constructor(private config: {
    url: string;
    headers?: Record<string, string>;
    timeout?: number;
    healthCheckEndpoint?: string;
  }) {}

  async connect(): Promise<void> {
    // Test connection
    await this.healthCheck();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const response = await fetch(`${this.config.url}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    this.messageHandler?.(result);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const endpoint = this.config.healthCheckEndpoint || '/health';
      const response = await fetch(`${this.config.url}${endpoint}`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### Stdio Transport Implementation

```typescript
// src/transports/StdioTransport.ts
import { spawn, ChildProcess } from 'child_process';

export class StdioTransport implements MCPTransport {
  private process?: ChildProcess;

  constructor(private config: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }) {}

  async connect(): Promise<void> {
    this.process = spawn(this.config.command, this.config.args || [], {
      env: { ...process.env, ...this.config.env },
      cwd: this.config.cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle stdout messages
    this.process.stdout?.on('data', (chunk) => {
      // Parse JSON-RPC messages
      const message = JSON.parse(chunk.toString());
      this.messageHandler?.(message);
    });

    // Handle stderr logs
    this.process.stderr?.on('data', (chunk) => {
      console.error('[MCP stderr]:', chunk.toString());
    });

    // Handle process exit
    this.process.on('exit', (code) => {
      this.closeHandler?.();
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Process not running');
    }

    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  async disconnect(): Promise<void> {
    this.process?.kill();
  }
}
```

---

## Registry Service

### MCPRegistry Class

```typescript
// src/registry/MCPRegistry.ts
export class MCPRegistry {
  constructor(
    private configStore: ConfigStore,
    private healthMonitor: HealthMonitor
  ) {}

  // CRUD operations
  async addMCP(name: string, config: MCPServerConfig): Promise<void>;
  async removeMCP(name: string): Promise<void>;
  async updateMCP(name: string, config: Partial<MCPServerConfig>): Promise<void>;
  async getMCP(name: string): Promise<MCPServerConfig | null>;
  async listMCPs(): Promise<Record<string, MCPServerConfig>>;

  // State management
  async enableMCP(name: string): Promise<void>;
  async disableMCP(name: string): Promise<void>;

  // Queries
  async getEnabledMCPs(): Promise<Record<string, MCPServerConfig>>;
  async getMCPsByTransport(transport: string): Promise<Record<string, MCPServerConfig>>;

  // Connection testing
  async testConnection(name: string): Promise<TestResult>;

  // Events
  on(event: 'configChanged' | 'mcpStatusChanged', handler: Function): void;
}
```

---

## Integration Changes

### Updated MCPAgent → MultiMCPAgent

```typescript
// src/services/MultiMCPAgent.ts
export class MultiMCPAgent {
  private mcpClients: Map<string, Client> = new Map();
  private toolRegistry: Map<string, string> = new Map(); // toolName → mcpName

  constructor(
    private provider: LLMProvider,
    private sessionId: string,
    private mcpRegistry: MCPRegistry,
    private conversationRepo: ConversationRepository,
    private events: AgentEvents
  ) {}

  async initialize(): Promise<void> {
    // Load enabled MCPs from registry
    const mcps = await this.mcpRegistry.getEnabledMCPs();

    // Connect to each MCP
    for (const [name, config] of Object.entries(mcps)) {
      try {
        const transport = TransportFactory.create(config);
        const client = new Client({ name: 'orchestrator', version: '1.0.0' }, {});

        await transport.connect();
        await client.connect(transport);

        this.mcpClients.set(name, client);
        console.log(`[MultiMCPAgent] Connected to MCP: ${name}`);
      } catch (error) {
        console.error(`[MultiMCPAgent] Failed to connect to ${name}:`, error);
        // Continue with other MCPs
      }
    }
  }

  async generateResponse(userPrompt: string): Promise<void> {
    // 1. Aggregate tools from all MCPs
    const allTools = await this.getAllTools();

    // 2. Call LLM with aggregated tools
    const result = await this.provider.generateResponse(history, userPrompt, allTools);

    // 3. Handle tool calls
    if (result.toolCalls) {
      for (const call of result.toolCalls) {
        await this.executeTool(call);
      }
    }
  }

  private async getAllTools(): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = [];

    for (const [mcpName, client] of this.mcpClients) {
      const toolsResult = await client.listTools();

      for (const tool of toolsResult.tools) {
        // Apply namespacing
        const toolName = this.applyNamespace(mcpName, tool.name);

        allTools.push({
          name: toolName,
          description: tool.description,
          parameters: tool.inputSchema
        });

        // Track which MCP owns this tool
        this.toolRegistry.set(toolName, mcpName);
      }
    }

    return allTools;
  }

  private async executeTool(call: ToolCall): Promise<void> {
    // Find which MCP owns this tool
    const mcpName = this.toolRegistry.get(call.name);
    if (!mcpName) {
      throw new Error(`Tool ${call.name} not found in any MCP`);
    }

    const client = this.mcpClients.get(mcpName);
    if (!client) {
      throw new Error(`MCP ${mcpName} not connected`);
    }

    // Remove namespace prefix if needed
    const actualToolName = this.removeNamespace(call.name);

    // Execute on correct MCP
    const result = await client.callTool({
      name: actualToolName,
      arguments: call.args
    });

    return result;
  }

  private applyNamespace(mcpName: string, toolName: string): string {
    // Based on settings.toolNamespacing
    // 'auto': Add prefix if there are conflicts
    // 'prefix': Always add prefix (azure:create_work_item)
    // 'none': No prefixing
    return `${mcpName}:${toolName}`;
  }
}
```

---

## Testing Strategy

### Unit Tests
- ConfigStore: File I/O, validation, environment variable interpolation
- MCPRegistry: CRUD operations, queries
- Transport adapters: Connection, message sending, health checks
- MultiMCPAgent: Tool aggregation, routing

### Integration Tests
- CLI commands: Add, remove, list MCPs
- End-to-end: Add MCP → Connect → List tools → Execute tool
- Multi-MCP: Multiple MCPs with overlapping tool names

### Manual Testing
1. Add Azure DevOps MCP via CLI
2. Start orchestrator
3. Send message requiring Azure tool
4. Verify tool call routes to correct MCP
5. Test MCP failure scenarios

---

## Success Criteria

✅ **Phase 1 Complete When**:
- Configuration file can be read/written
- Registry can manage MCP configs
- All transport adapters implemented
- Can connect to external MCP (Azure DevOps)

✅ **Phase 2 Complete When**:
- `llm` command globally accessible
- Can add/remove MCPs via CLI
- Interactive prompts work
- Beautiful output formatting

✅ **Phase 3 Complete When**:
- Orchestrator connects to multiple MCPs
- Tools from all MCPs available in chat
- Tool calls route correctly
- No breaking changes to existing functionality

✅ **Phase 4 Complete When**:
- Health monitoring active
- Auto-reconnection works
- Graceful degradation on MCP failure

✅ **Phase 5 Complete When** (Optional):
- Web UI functional
- Real-time status updates work

---

## Timeline Estimate

- **Phase 1**: 4-6 hours
- **Phase 2**: 3-4 hours
- **Phase 3**: 4-5 hours
- **Phase 4**: 2-3 hours
- **Phase 5**: 4-6 hours (optional)

**Total**: 13-18 hours (excluding Web UI)

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "eventsource": "^2.0.2"
  },
  "devDependencies": {
    "commander": "^12.0.0",
    "inquirer": "^9.2.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.3"
  }
}
```

---

## Next Steps

1. ✅ Review and approve this plan
2. 🚀 Start with Phase 1: Core Infrastructure
3. 📝 Create initial `mcp-config.json` with Azure DevOps example
4. 🔧 Build ConfigStore and MCPRegistry services
5. 🔌 Implement transport adapters
6. 🧪 Test with existing Azure DevOps MCP

---

## Open Questions

1. **Tool Namespacing**: Should we default to `auto`, `prefix`, or `none`?
2. **Health Check Interval**: 60 seconds good, or too frequent?
3. **Error Handling**: Should MCP failure stop the session or continue with degraded functionality?
4. **Configuration Hot Reload**: Should config changes apply immediately or require restart?
5. **Web UI Priority**: Build now or wait for feedback on CLI?

---

*Last Updated: 2026-02-11*
