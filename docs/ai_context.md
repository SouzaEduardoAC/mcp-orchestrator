# AI Context: MCP Orchestrator

## Metadata
- **Analysis Date**: 2026-02-10
- **Architectural Style**: Modular Monolith with Strategy Pattern (LLM Providers)
- **Primary Tech Stack**: Node.js, TypeScript, Docker, Redis, Socket.io, MCP SDK

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
The system is an **MCP-to-LLM bridge**. It abstracts model-specific SDKs behind the `LLMProvider` interface. The `MCPAgent` acts as the orchestrator, managing a 4-way sync between:
1. The Client (via Socket.io)
2. The LLM (via LLMProvider)
3. The Tool Environment (via DockerContainerTransport)
4. The State (via Redis)

`LLM_PROVIDER` environment variable dictates the active strategy. `clientToken` (passed via Socket auth) can override server-side API keys.
