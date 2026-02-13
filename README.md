# MCP Orchestrator

> **Multi-MCP Orchestration Platform with Health Monitoring and Management**

The **MCP Orchestrator** is a production-ready platform that enables LLMs (Claude, Gemini, OpenAI) to interact with multiple Model Context Protocol (MCP) servers simultaneously. It features automatic health monitoring, resilience patterns, and comprehensive management tools.

## 🌟 Key Features

### Multi-MCP Support
- **Multiple MCP Servers**: Connect to unlimited MCP servers simultaneously
- **Tool Aggregation**: Automatically combines tools from all connected MCPs
- **Multiple Tool Calls**: Sequential approval with parallel execution for optimal performance
- **Smart Namespacing**: Automatic conflict resolution with configurable prefixes
- **Transport Flexibility**: Supports HTTP, stdio, SSE, and Docker transports

### Health Monitoring & Resilience
- **Automatic Health Checks**: Periodic monitoring (60s intervals)
- **Auto-Reconnection**: Exponential backoff with circuit breaker pattern
- **Status Tracking**: Real-time health status (healthy/unhealthy/reconnecting/disconnected)
- **Event-Driven Architecture**: React to health changes in real-time

### Management Tools
- **CLI Interface**: Complete `llm` command-line tool for MCP management
- **Web Dashboard**: Visual monitoring and management with real-time updates
- **Web-Based MCP Creation**: Add new MCP servers via graphical form (no CLI needed)
- **REST API**: Programmatic access to health status, metrics, and MCP creation
- **Interactive Prompts**: User-friendly MCP configuration (CLI and Web)

### Multi-LLM Support
- **Google Gemini**: 2.0 Flash, 1.5 Flash, 1.5 Pro
- **Anthropic Claude**: Sonnet 4.5, Opus 4.6, Haiku 4.5
- **OpenAI**: GPT-4o, GPT-4o Mini, GPT-4 Turbo
- **Runtime Switching**: Change models without restarting

### Security & Isolation
- **Docker Sandboxes**: Isolated containers for each MCP
- **Resource Limits**: Configurable memory (512MB) and CPU (0.5 cores)
- **Human-in-the-Loop**: Tool approval workflow
- **Session Management**: Secure, isolated workspaces per user

## ✨ What's New

**Multiple Tool Call Support** - LLMs can now request multiple tools simultaneously! The orchestrator handles:
- **Sequential Approval**: Tools are presented one at a time with clear progress indicators (1 of 3, 2 of 3, etc.)
- **Parallel Execution**: Once all approved, tools execute simultaneously for optimal performance
- **Smart Queue Management**: Follow-up tools based on results are preserved and processed correctly
- **Visual Feedback**: UI shows queue position and waiting status for remaining approvals

**Web-Based MCP Creation** - You can now add MCP servers directly through the web interface without using the CLI! Simply click the "+ Add MCP" button in the MCP Management tab to create new servers with a user-friendly graphical form supporting all transport types (HTTP, SSE, Stdio, Stdio-Docker).

**HTTP/SSE Transport Support** - Full support for HTTP and SSE-based MCP servers. Connect to remote MCP servers using Server-Sent Events or REST APIs.

**Persistent Configuration** - MCP configurations are now persisted via Docker volumes, surviving container restarts and rebuilds.

## 📚 Documentation

*   [**Business Flow**](./docs/business_flow.md): User journey and high-level logic
*   [**Technical Specifications**](./docs/technical_specifications.md): Architecture and implementation details
*   [**AI Context**](./docs/ai_context.md): Machine-readable summary for developers
*   [**MCP Registry Implementation**](./docs/MCP_REGISTRY_IMPLEMENTATION_PLAN.md): Multi-MCP system design

## 🚀 Quick Start

### Prerequisites
- **Docker & Docker Compose** installed
- **Node.js 22+** (for local development)
- API keys for your chosen LLM provider

### 1. Configuration
Create a `.env` file in the root directory:
```env
# LLM Provider Selection
LLM_PROVIDER=claude          # choices: gemini, claude, openai
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here

# LLM Response Configuration (Optional)
MAX_OUTPUT_TOKENS=8192       # Max tokens for LLM responses (default: 8192)
MAX_HISTORY_TOKENS=30000     # Max tokens in conversation history (default: 30000)
```

### 2. Start the System
```bash
docker compose up --build
```

This starts:
- MCP Orchestrator (port 3000)
- Redis (session management)
- Default filesystem MCP server

### 3. Access the Interface

**Web Dashboard**: http://localhost:3000
- 💬 **Chat Tab**: Interact with LLMs using MCP tools
- 🔧 **MCP Management Tab**: Monitor health and manage MCPs

**CLI Access**:
```bash
# Enter the container
docker exec -it mcp-orchestrator-app-1 sh

# Or run commands directly
docker exec mcp-orchestrator-app-1 npm run llm -- mcp list
```

## 🛠️ MCP Management CLI

Complete command-line interface for managing MCP servers:

### List MCPs
```bash
llm mcp list              # Show all registered MCPs
llm mcp list --enabled    # Show only enabled MCPs
llm mcp list --format json # Output as JSON
```

### Add MCP Servers
```bash
# Interactive mode
llm mcp add

# Non-interactive with flags
llm mcp add filesystem \
  --transport stdio-docker \
  --image mcp-server:latest \
  --description "File system operations"

# HTTP/SSE transport
llm mcp add api-server \
  --transport http \
  --url http://mcp-api:8080 \
  --description "External API MCP"

# Local stdio transport
llm mcp add local-mcp \
  --transport stdio \
  --command node \
  --args "dist/mcp-server.js" \
  --description "Local Node.js MCP"
```

### Manage MCPs
```bash
llm mcp enable <name>     # Enable an MCP
llm mcp disable <name>    # Disable without removing
llm mcp remove <name>     # Remove MCP (with confirmation)
llm mcp remove <name> -y  # Skip confirmation
```

### Health & Testing
```bash
llm mcp health            # Check health of all MCPs
llm mcp test <name>       # Test connection to specific MCP
llm mcp info <name>       # Show detailed MCP information
```

## 📊 Web Dashboard

The web interface provides real-time monitoring and management:

### Features
- **Summary Cards**: Total, healthy, and issues count
- **Add MCP Server**: Create new MCP configurations via graphical form
- **MCP List**: Real-time health status for each server
- **Status Indicators**:
  - ✓ **Healthy** (green): MCP responding normally
  - ⚠ **Unhealthy** (red): Health checks failing
  - ↻ **Reconnecting** (yellow): Attempting recovery
  - ✗ **Disconnected** (gray): Max retries reached
- **Timestamps**: Last check and last success times
- **Error Details**: Detailed error messages for failed MCPs
- **Manual Refresh**: Update health status on demand

### Adding MCPs via Web UI
1. Open http://localhost:3000
2. Click "🔧 MCP Management" tab
3. Click the **"+ Add MCP"** button (green button)
4. Fill in the form:
   - **Name**: Unique identifier (letters, numbers, hyphens, underscores)
   - **Transport Type**: Select HTTP, SSE, Stdio, or Stdio-Docker
   - **Transport-Specific Fields**: URL, command, or container image based on transport
   - **Description** (optional): Brief description of the MCP server
   - **Additional Options**: Headers (HTTP/SSE), arguments (stdio), or resource limits (Docker)
5. Click **"Add MCP Server"**
6. New MCP appears automatically in the list

### Transport Types in Web UI

**HTTP/SSE**:
- URL (required): `https://example.com/mcp`
- Custom Headers (optional): Add key-value pairs

**Stdio**:
- Command (required): `node`
- Arguments (optional): `server.js --port 3000`
- Working Directory (optional): `/app`

**Stdio-Docker**:
- Container Image (required): `mcp-server:latest`
- Memory Limit (optional): `512` MB
- CPU Limit (optional): `0.5` cores

### Navigation
1. Open http://localhost:3000
2. Enter API key when prompted
3. Click "🔧 MCP Management" tab
4. View real-time health dashboard or add new MCPs

## 🔌 API Endpoints

### Health Status
```bash
GET /api/mcp/health
```

Returns:
```json
{
  "summary": {
    "total": 1,
    "healthy": 1,
    "unhealthy": 0,
    "reconnecting": 0,
    "disconnected": 0
  },
  "mcps": [
    {
      "name": "filesystem",
      "status": "healthy",
      "lastCheck": 1770827144464,
      "lastSuccess": 1770827144464,
      "consecutiveFailures": 0
    }
  ]
}
```

### Add MCP Server
```bash
POST /api/mcp/add
Content-Type: application/json
```

Request body:
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

Responses:
- **201**: Success - `{"message": "MCP server added successfully", "name": "my-mcp"}`
- **400**: Validation error - `{"error": "Name can only contain letters, numbers, hyphens, and underscores"}`
- **409**: Duplicate - `{"error": "MCP server 'my-mcp' already exists"}`
- **500**: Server error - `{"error": "Error message"}`

### Model Detection
```bash
GET /api/models/available    # Get accessible models
GET /api/models/check         # Diagnostic model testing
```

## 🎯 Available MCP Tools

Default filesystem MCP provides:

| Tool | Description | Example Use |
|------|-------------|-------------|
| `read_file` | Read file contents | View configuration files |
| `write_file` | Write to files | Create or update files |
| `list_files` | List directory contents | Browse workspace |
| `execute_command` | Run bash commands | Install packages, run scripts |

## ⚙️ LLM Response Configuration

The orchestrator provides configurable token limits to optimize LLM responses and prevent context window overflow:

### MAX_OUTPUT_TOKENS
Controls the maximum length of LLM responses.

- **Default**: 8,192 tokens (~32,000 characters)
- **Purpose**: Allows comprehensive responses without truncation
- **Impact**: Higher values increase API costs but ensure complete responses
- **Range**: 1,024 - 8,192 tokens (Claude Sonnet 4.5 maximum)

**Example**: Set to 4,096 for shorter responses and lower costs:
```env
MAX_OUTPUT_TOKENS=4096
```

### MAX_HISTORY_TOKENS
Controls conversation history size sent to the LLM.

- **Default**: 30,000 tokens
- **Purpose**: Balances context retention with token budget
- **Context Window Budget** (200k total):
  - History: 30k tokens
  - Tool definitions: 80-100k tokens (with many MCPs)
  - Current prompt: 5-10k tokens
  - Response buffer: 5k tokens
  - Headroom: ~55k tokens

**Why 30k?** With multiple MCPs connected, tool definitions can consume 80-100k+ tokens. The history limit must leave room for tools, prompts, and responses within Claude's 200k context window.

**Example**: Increase for longer conversations (if you have fewer MCPs):
```env
MAX_HISTORY_TOKENS=50000
```

### Conversation Management
The system automatically:
- **Truncates history** when it exceeds MAX_HISTORY_TOKENS (keeps most recent messages)
- **Clears history** if total input (history + tools + prompt) would exceed context window
- **Compresses messages** when ENABLE_CONVERSATION_COMPRESSION is enabled
- **Expires sessions** after 24 hours of inactivity (configurable via HISTORY_TTL_SECONDS)

### Troubleshooting Token Errors

**"prompt is too long" error:**
1. Reduce MAX_HISTORY_TOKENS (default: 30,000)
2. Enable conversation compression: `ENABLE_CONVERSATION_COMPRESSION=true`
3. Disable unused MCPs to reduce tool definition tokens
4. Clear conversation history by refreshing the page

**Responses cut off mid-sentence:**
1. Increase MAX_OUTPUT_TOKENS (default: 8,192)
2. Check API provider's output token limits

## 🔄 Multiple Tool Call Workflow

When LLMs need to use multiple tools (e.g., reading several files or querying multiple APIs), the orchestrator provides an optimized approval and execution workflow:

### How It Works

1. **LLM Request**: The LLM returns multiple tool calls in a single response
2. **Queue Management**: All tool calls are stored in a queue with status tracking
3. **Sequential Approval**: Tools are presented one at a time for user approval
   - Clear progress indicators: "Tool Approval Request (1 of 3)"
   - User can approve or reject each tool individually
4. **Parallel Execution**: Once all tools are approved, they execute simultaneously
5. **Result Aggregation**: Results are collected and sent back to the LLM
6. **Follow-up Handling**: If the LLM needs additional tools based on results, the cycle continues

### Example Scenario

```
User: "Read package.json, README.md, and check the git status"

Orchestrator:
├─ Approval Request (1 of 3): read_file(package.json) → ✓ Approved
├─ Approval Request (2 of 3): read_file(README.md)    → ✓ Approved
├─ Approval Request (3 of 3): execute_command(git status) → ✓ Approved
│
├─ [Parallel Execution]
│  ├─ read_file(package.json) ✓ Complete
│  ├─ read_file(README.md) ✓ Complete
│  └─ execute_command(git status) ✓ Complete
│
└─ Results sent to LLM → LLM analyzes and responds
```

### Benefits

- **User Control**: Approve each tool individually with full context
- **Performance**: Parallel execution minimizes wait time
- **Reliability**: Smart queue management prevents tool loss
- **Transparency**: Clear visibility into multi-tool workflows

## 📁 Configuration File

MCPs are configured in `mcp-config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio-docker",
      "containerImage": "mcp-server:latest",
      "enabled": true,
      "description": "Local file system operations",
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

### Transport Types

**stdio-docker**:
```json
{
  "transport": "stdio-docker",
  "containerImage": "mcp-server:latest",
  "containerEnv": { "VAR": "value" },
  "containerMemory": 512,
  "containerCpu": 0.5
}
```

**http/sse**:
```json
{
  "transport": "sse",
  "url": "http://mcp-server:8080/sse",
  "headers": { "Authorization": "Bearer ${API_KEY}" },
  "timeout": 30000
}
```

**Note**: SSE-based MCP servers often require a specific endpoint path (e.g., `/sse`). Check your MCP server's documentation for the correct URL.

**stdio**:
```json
{
  "transport": "stdio",
  "command": "node",
  "args": ["dist/server.js"],
  "env": { "NODE_ENV": "production" },
  "cwd": "/app"
}
```

### Namespacing Strategies

- **`auto`** (default): Apply prefixes only when multiple MCPs are connected
- **`prefix`**: Always apply MCP name as prefix (e.g., `filesystem_read_file`)
- **`none`**: No prefixing (last MCP wins if conflicts exist)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│       Web UI (Vue 3 + TailwindCSS)          │
│  ┌──────────┐  ┌─────────────────────────┐ │
│  │ Chat Tab │  │ MCP Management Dashboard │ │
│  └──────────┘  └─────────────────────────┘ │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────┴────────────────────────┐
│         HTTP API & Socket.IO Server         │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────┴────────────────────────┐
│           MCPHealthMonitor                  │
│  (Periodic checks + Auto-reconnection)      │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────┴────────────────────────┐
│        MCPConnectionManager                 │
│  (Multi-MCP aggregation & routing)          │
└────────────────────┬────────────────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
  ┌───┴───┐     ┌───┴───┐     ┌───┴───┐
  │ MCP 1 │     │ MCP 2 │     │ MCP 3 │
  │Docker │     │Docker │     │ HTTP  │
  └───────┘     └───────┘     └───────┘
```

### Key Components

**MCPConnectionManager**
- Manages multiple MCP connections
- Aggregates tools with namespacing
- Routes tool calls to correct MCP
- Handles connection lifecycle

**MCPHealthMonitor**
- Periodic health checks (60s interval)
- Automatic reconnection with backoff
- Circuit breaker pattern (3 failures)
- Event-driven status updates

**MCPRegistry**
- Configuration management
- CRUD operations for MCPs
- Enable/disable functionality
- Environment variable interpolation

**TransportFactory**
- Creates appropriate transport instances
- Supports multiple transport protocols
- Configuration-driven initialization

## 🔐 Security Features

- **Container Isolation**: Each MCP runs in isolated Docker container
- **Resource Limits**: Configurable memory and CPU constraints
- **Tool Approval**: Human-in-the-loop for sensitive operations
- **Session Management**: Isolated workspaces per user
- **No Network Access**: Containers run without network by default
- **Environment Variables**: Secure secrets handling with interpolation

## 🧪 Development

### Local Development
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development mode with watch
npm run dev
```

### Run Tests
```bash
npm test
```

### Build MCP Server Image
```bash
docker build -t mcp-server:latest -f Dockerfile.mcp .
```

## 📈 Monitoring & Observability

### Health Checks
- Automatic periodic checks every 60 seconds
- Manual health checks via CLI or API
- Real-time status updates in dashboard
- Consecutive failure tracking

### Status Indicators
- **Healthy**: All health checks passing
- **Unhealthy**: Health checks failing (< 3 failures)
- **Reconnecting**: Attempting automatic recovery
- **Disconnected**: Max reconnection attempts reached

### Event Logging
```
[MCPHealthMonitor] Started with interval 60000ms
[MCPConnectionManager] Connected to MCP: filesystem
[Agent session-xyz] Connected to MCPs: [ 'filesystem', 'api-server' ]
[MCPHealthMonitor] MCP 'filesystem' is now healthy
```

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### MCP Not Connecting
```bash
# Check MCP status
llm mcp health

# Test specific MCP
llm mcp test <name>

# View detailed info
llm mcp info <name>

# Check container logs
docker logs mcp-orchestrator-app-1
```

### Health Checks Failing
1. Verify MCP container is running: `docker ps`
2. Check container logs for errors
3. Test connection manually: `llm mcp test <name>`
4. Try reconnecting: Disable then enable the MCP

### Tool Execution Errors
1. Check tool is available: `llm mcp info <name>`
2. Verify MCP is healthy: `llm mcp health`
3. Review error message in logs
4. Check container resource limits

### MCP Tools Not Appearing in Chat
If you add a new MCP but its tools don't appear in your chat session:
1. **Refresh the browser page** - Chat sessions load MCPs on initialization
2. Check the MCP is healthy in the 🔧 MCP Management tab
3. Look for connection errors: `docker logs mcp-orchestrator-app-1 | grep -i "failed"`
4. For SSE/HTTP MCPs, verify the endpoint URL includes the correct path (e.g., `/sse`)

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Anthropic Claude](https://www.anthropic.com/claude)
- [Google Gemini](https://ai.google.dev/)
- [OpenAI GPT](https://platform.openai.com/)

---

**Built with ❤️ using TypeScript, Docker, and the Model Context Protocol**
