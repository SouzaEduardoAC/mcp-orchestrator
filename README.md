# MCP Orchestrator

> **Secure, Hardened, and Human-in-the-Loop AI Tool Execution**

The **MCP Orchestrator** is a specialized runtime that allows Google's Gemini models to interact with the physical world (files, shell, APIs) via isolated, resource-constrained Docker containers.

## 📚 Authoritative Documentation
*   [**Business Flow**](./docs/business_flow.md): Understand the user journey and high-level logic.
*   [**Technical Specifications**](./docs/technical_specifications.md): Deep dive into locking, security, and infrastructure.
*   [**AI Context**](./docs/ai_context.md): Machine-readable summary for developers and AI agents.

## Core Features
- 🔒 **Hardened Sandboxes**: Containers run with 512MB RAM, 0.5 CPU, and **no network access**.
- 🤝 **Human-in-the-Loop**: Tool calls pause for user approval via a real-time Vue.js UI.
- ⚡ **Concurrency Safe**: Distributed locking prevents container duplication.
- 🧠 **Gemini 2.0 Native**: Optimized for the latest multimodal reasoning and function calling capabilities.

## Quick Start
1.  Ensure Docker and Redis are running.
2.  Install dependencies: `npm install`
3.  Set `GOOGLE_API_KEY` in `.env`.
4.  Start the system: `npm run build && npm start`
5.  Visit `http://localhost:3000`.
