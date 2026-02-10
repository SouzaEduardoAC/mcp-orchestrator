# MCP Orchestrator

> **Secure, Dockerized AI Agent Runtime**

The **MCP Orchestrator** is a Node.js application that bridges Google's Gemini 2.0 Flash model with a sandboxed environment. It utilizes the **Model Context Protocol (MCP)** to allow the AI to safely discover and execute tools within isolated Docker containers.

## 📚 Documentation
*   [**Business Flow**](./docs/business_flow.md): High-level architecture and user journey.
*   [**Technical Specs**](./docs/technical_specifications.md): Deep dive into classes, state management, and error handling.
*   [**AI Context**](./docs/ai_context.md): Machine-optimized summary of the stack.

## Key Features
*   **Sandboxed Execution**: Every session gets a dedicated `mcp-server` Docker container.
*   **Human-in-the-Loop**: Tool calls require explicit user approval via the socket interface.
*   **State Persistence**: Redis-backed session and conversation storage.
*   **Gemini 2.0 Integration**: Uses the latest multimodal models for high-speed reasoning.