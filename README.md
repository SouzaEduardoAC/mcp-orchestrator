# MCP Orchestrator

> **Secure, Hardened, and Human-in-the-Loop Multi-LLM Tool Execution**

The **MCP Orchestrator** is a specialized runtime that allows LLMs (Gemini, Claude, GPT) to interact with the physical world (files, shell, APIs) via isolated, resource-constrained Docker containers using the Model Context Protocol (MCP).

## 🚀 Multi-LLM Support
The system is provider-agnostic with **dynamic model selection**. Choose from the latest models:
- **Google Gemini**: 2.0 Flash, 1.5 Flash, 1.5 Pro
- **Anthropic Claude**: Sonnet 4.5, Opus 4.6, Haiku 4.5, and Claude 3 family
- **OpenAI**: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo

**NEW**: Runtime model switching via UI dropdown - change models without restarting!

## 📚 Authoritative Documentation
*   [**Business Flow**](./docs/business_flow.md): Understand the user journey and high-level logic.
*   [**Technical Specifications**](./docs/technical_specifications.md): Deep dive into provider interfaces, locking, and infrastructure.
*   [**AI Context**](./docs/ai_context.md): Machine-readable summary for developers and AI agents.

## Core Features
- 🔒 **Hardened Sandboxes**: Containers run with strict resource limits and security profiles (512MB RAM, 0.5 CPU, no network)
- 🤝 **Human-in-the-Loop**: Tool calls pause for user approval via real-time WebSocket events
- ⚡ **Concurrency Safe**: Distributed locking and session management via Redis
- 🧩 **Strategy Pattern**: Decoupled LLM logic from MCP orchestration
- 🎨 **Dynamic UI**: Frontend automatically adapts branding and prompts to the active LLM provider
- 🔄 **Runtime Model Selection**: Switch between models on-the-fly via dropdown selector
- 🔍 **Smart Model Detection**: Automatically detects available models based on your API key
- 🛠️ **Full MCP Implementation**: 4 production-ready tools (read_file, write_file, list_files, execute_command)

## 🚀 Raising the Environment

### 1. Prerequisites
- **Docker & Docker Compose** installed.
- **Node.js 22+** (if running locally without Docker).
- **Redis** (if running locally without Docker).

### 2. Configuration
Create a `.env` file in the root directory:
```env
LLM_PROVIDER=gemini # choices: gemini, claude, openai
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

### 3. Start with Docker Compose (Recommended)
This is the easiest way to start the system, including the Redis instance and the MCP placeholder image:
```bash
docker-compose up --build
```
*Note: The `mcp-placeholder` service builds the `mcp-server:latest` image used by the orchestrator for session containers.*

### 4. Start Locally (Development)
If you prefer running the Node.js process directly:
1. Start Redis: `docker run -p 6379:6379 -d redis:alpine`
2. Build the MCP template: `docker build -t mcp-server:latest -f Dockerfile.mcp .`
3. Install dependencies: `npm install`
4. Start dev mode: `npm run dev`

### 5. Access the Web Interface
Open your browser and navigate to `http://localhost:3000`. You'll see:
- **Loading Screen**: While the system checks which models are available with your API key (~5-10 seconds)
- **Model Selector**: Dropdown showing only the models you have access to
- **Chat Interface**: Send messages and approve tool executions in real-time

## 🎯 Available MCP Tools

The orchestrator spawns isolated containers with these tools:

| Tool | Description | Example |
|------|-------------|---------|
| `read_file` | Read contents of a file in the workspace | Read configuration files |
| `write_file` | Write content to a file | Create or update files |
| `list_files` | List files in a directory | Browse workspace contents |
| `execute_command` | Execute bash commands (30s timeout) | Run scripts, install packages |

## 🔧 Advanced Features

### Dynamic Model Detection
The system automatically tests which models are available with your API key:
- **Endpoint**: `GET /api/models/available` - Returns only accessible models
- **Diagnostic**: `GET /api/models/check` - Detailed availability testing

### Model Selection
Choose models at runtime via the UI dropdown or query parameter:
```javascript
socket.io({
  query: {
    sessionId: 'your-session-id',
    model: 'claude-sonnet-4-5-20250929' // Optional: override default
  }
})
```
