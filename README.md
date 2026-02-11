# MCP Orchestrator

> **Multi-MCP Orchestration Platform with Health Monitoring and Management**

The **MCP Orchestrator** is a production-ready platform that enables LLMs (Claude, Gemini, OpenAI) to interact with multiple Model Context Protocol (MCP) servers simultaneously. It features automatic health monitoring, resilience patterns, and comprehensive management tools.

## 🌟 Key Features

### Multi-MCP Support
- **Multiple MCP Servers**: Connect to unlimited MCP servers simultaneously
- **Tool Aggregation**: Automatically combines tools from all connected MCPs
- **Smart Namespacing**: Automatic conflict resolution with configurable prefixes
- **Transport Flexibility**: Supports HTTP, stdio, SSE, and Docker transports

### Health Monitoring & Resilience
- **Automatic Health Checks**: Periodic monitoring (60s intervals)
- **Auto-Reconnection**: Exponential backoff with circuit breaker pattern
- **Status Tracking**: Real-time health status (healthy/unhealthy/reconnecting/disconnected)
- **Event-Driven Architecture**: React to health changes in real-time

### Management Tools
- **CLI Interface**: Complete `llm` command-line tool for MCP management
- **Web Dashboard**: Visual monitoring interface with real-time updates
- **REST API**: Programmatic access to health status and metrics
- **Interactive Prompts**: User-friendly MCP configuration

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
LLM_PROVIDER=claude          # choices: gemini, claude, openai
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
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
- **MCP List**: Real-time health status for each server
- **Status Indicators**:
  - ✓ **Healthy** (green): MCP responding normally
  - ⚠ **Unhealthy** (red): Health checks failing
  - ↻ **Reconnecting** (yellow): Attempting recovery
  - ✗ **Disconnected** (gray): Max retries reached
- **Timestamps**: Last check and last success times
- **Error Details**: Detailed error messages for failed MCPs
- **Manual Refresh**: Update health status on demand

### Navigation
1. Open http://localhost:3000
2. Enter API key when prompted
3. Click "🔧 MCP Management" tab
4. View real-time health dashboard

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
  "transport": "http",
  "url": "http://mcp-server:8080",
  "headers": { "Authorization": "Bearer ${API_KEY}" },
  "timeout": 30000
}
```

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

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Anthropic Claude](https://www.anthropic.com/claude)
- [Google Gemini](https://ai.google.dev/)
- [OpenAI GPT](https://platform.openai.com/)

---

**Built with ❤️ using TypeScript, Docker, and the Model Context Protocol**
