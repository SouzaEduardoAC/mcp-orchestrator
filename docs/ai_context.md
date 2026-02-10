# AI Context & Metadata
> **Last Synced:** February 10, 2026
> **System:** MCP Orchestrator
> **Role:** Authority Documentation

## Core Technology Stack
*   **Runtime:** Node.js (TypeScript)
*   **Orchestration:** Docker (Container API)
*   **State:** Redis (ioredis)
*   **AI Model:** Google Gemini 2.0 Flash (`@google/generative-ai`)
*   **Protocol:** Model Context Protocol (MCP) SDK (`@modelcontextprotocol/sdk`)

## Dependency Graph
*   **`src/index.ts`**
    *   Imports: `AppServer`, `RedisFactory`, `DockerClient`, `SessionManager`, `JanitorService`, `SocketRegistry`.
    *   Role: Bootstrapper, Dependency Injection Root.
*   **`src/services/GeminiAgent.ts`**
    *   Imports: `GoogleGenerativeAI`, `Client` (MCP), `DockerContainerTransport`.
    *   Role: LLM Client, Tool Invocation Controller.
*   **`src/services/SessionManager.ts`**
    *   Imports: `DockerClient`, `SessionRepository`.
    *   Role: Container Lifecycle Manager.

## Critical Constraints for Codebase Modification
1.  **Session Isolation**: All tool execution MUST occur within the Docker container managed by `SessionManager`. Never execute arbitrary code on the host.
2.  **Tool Approval**: The `GeminiAgent` logic enforces a `pendingCall` state. Tools cannot run without an explicit `executeTool` call (user approval flow).
3.  **Stateless API**: `GeminiAgent` does not maintain internal history state; it relies on `ConversationRepository` (Redis) to rebuild context.
