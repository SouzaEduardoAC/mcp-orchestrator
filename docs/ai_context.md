# AI Context & Metadata
> **Last Synced:** February 10, 2026
> **System:** MCP Orchestrator
> **State:** Production-Ready Prototype

## High-Density Summary
Node.js/TypeScript orchestrator implementing the **Model Context Protocol (MCP)**. It provides a secure, human-in-the-loop bridge between **Google Gemini 2.0 Flash** and **hardened Docker containers**.

## Technical Identity
*   **Concurrency**: Distributed locking via Redis (ioredis).
*   **Sandbox**: Dockerode (HostConfig limits + Network isolation).
*   **Intelligence**: `@google/generative-ai` (Function Calling / Tool Use).
*   **Communication**: `Socket.io` (Real-time updates & Tool Approvals).

## Dependency Roles
*   **`@modelcontextprotocol/sdk`**: Provides the base for `DockerContainerTransport` and `MCP Client`.
*   **`dockerode`**: Low-level Docker API management.
*   **`redis`**: Backing store for `SessionRepository` and `ConversationRepository`.
*   **`src/services/GeminiAgent.ts`**: The core ReAct orchestrator; handles tool normalization and UI event emission.

## Execution Rules for Agents
1.  **Always use `acquireSession`**: Never interact with Docker directly; use the manager to ensure locking and state tracking.
2.  **Strict Isolation**: Containers must remain in `NetworkMode: 'none'`. Do not "fix" tool connectivity issues by enabling the network.
3.  **History Integrity**: Always use `ConversationRepository` for chat context; the agent service is stateless across requests.