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

## Quick Start
1.  Ensure Docker and Redis are running.
2.  Set `LLM_PROVIDER` (e.g., `claude`) and relevant API Key in `.env`.
3.  Install & Start: `npm install && npm run build && npm start`