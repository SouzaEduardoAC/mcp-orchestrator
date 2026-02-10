# MCP Orchestrator

> **Secure, Hardened, and Human-in-the-Loop Multi-LLM Tool Execution**

The **MCP Orchestrator** is a specialized runtime that allows LLMs (Gemini, Claude, GPT) to interact with the physical world (files, shell, APIs) via isolated, resource-constrained Docker containers using the Model Context Protocol (MCP).

## 🚀 Multi-LLM Support
The system is now provider-agnostic. Toggle between the world's leading models via environment variables:
- **Google Gemini 2.0 Flash**
- **Anthropic Claude 3.5 Sonnet**
- **OpenAI GPT-4o**

## 📚 Authoritative Documentation
*   [**Business Flow**](./docs/business_flow.md): Understand the user journey and high-level logic.
*   [**Technical Specifications**](./docs/technical_specifications.md): Deep dive into provider interfaces, locking, and infrastructure.
*   [**AI Context**](./docs/ai_context.md): Machine-readable summary for developers and AI agents.

## Core Features
- 🔒 **Hardened Sandboxes**: Containers run with strict resource limits and security profiles.
- 🤝 **Human-in-the-Loop**: Tool calls pause for user approval via real-time WebSocket events.
- ⚡ **Concurrency Safe**: Distributed locking and session management via Redis.
- 🧩 **Strategy Pattern**: Decoupled LLM logic from MCP orchestration.
- 🎨 **Dynamic UI**: Frontend automatically adapts branding and prompts to the active LLM provider.

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

### 5. Verify the Connection
Once the server is running on `http://localhost:3000`, you can connect via WebSocket (Socket.io) to start a session.
