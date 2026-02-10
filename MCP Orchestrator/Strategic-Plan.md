# Strategic Plan: Dynamic MCP Orchestrator

## 1. Understanding the Goal
The objective is to architect and implement the **Dynamic MCP Orchestrator**, a Node.js/TypeScript-based system that bridges the Gemini API with the Model Context Protocol (MCP). The core innovation lies in using ephemeral Docker containers to isolate MCP servers, communicating via standard input/output streams ("Pipes") rather than HTTP.

Key attributes of the desired system:
*   **Isolation:** MCP servers run in sandboxed Docker containers.
*   **Protocol:** Uses standard `stdio` communication, requiring a custom `McpTransport` implementation to bridge the Docker stream.
*   **Stateful:** Utilizes Redis to map user sessions to container IDs and persist conversation state.
*   **Interactive:** A real-time WebSocket (Socket.io) interface handles user approvals for tool execution.
*   **Secure:** Enforces strict resource limits (CPU/Memory) and non-root execution context.

## 2. Investigation & Analysis
**Current State:**
*   **Directory:** `/home/ecoza/Projects/mcp-gateway`
*   **Status:** Greenfield (Empty repository containing only a `LICENSE`).
*   **Context:** The host is a Fedora 43 workstation with ample RAM (32GB), suitable for running multiple concurrent containers.

**Analysis:**
Since this is a fresh start, the strategy focuses on laying a solid architectural foundation. The dependency on `dockerode` for stream manipulation is the critical technical risk that must be addressed first. The "Pipe" strategy requires precise handling of `stdin`/`stdout` and correct demultiplexing of the Docker stream to ensure the JSON-RPC protocol remains uncorrupted by logs (stderr).

## 3. Proposed Strategic Approach

I propose executing this project in **four distinct phases**, prioritizing the hardest technical problem (Docker Stream Bridging) first.

### Phase I: The Docker Pipe Bridge (Foundation)
*   **Goal:** Establish the ability to spawn an MCP container and communicate with it via JSON-RPC over stdio.
*   **Tech Stack:** Node.js, TypeScript, `dockerode`, `@modelcontextprotocol/sdk`.
*   **Key Tasks:**
    1.  **Project Initialization:** Scaffolding the backend structure (Express/Socket.io setup).
    2.  **Docker Client Setup:** Configuring `dockerode` to communicate with the host Docker socket.
    3.  **`DockerStreamTransport` Implementation:** Creating a custom class implementing `McpTransport`. This class must:
        *   Attach to the container stream with `{hijack: true, stdin: true, stdout: true}`.
        *   Use `dockerode.modem.demuxStream` to separate `stdout` (RPC messages) from `stderr` (logs).
        *   Pipe write operations to the container's `stdin`.

### Phase II: State & Session Management
*   **Goal:** Enable multiple users to have distinct, persistent sessions.
*   **Tech Stack:** Redis.
*   **Key Tasks:**
    1.  **Redis Integration:** Set up a Redis client for key-value storage.
    2.  **Session Registry:** Implement logic to map `SessionID` -> `ContainerID`.
    3.  **Lifecycle Hooks:**
        *   **On Connect:** Check Redis for an existing container. If missing, spawn a new one.
        *   **On Disconnect:** Decide whether to pause or reap the container (based on timeout policy).
    4.  **The "Janitor":** Implement the 15-minute inactivity monitor to kill idle containers and clean up Redis.

### Phase III: The Orchestrator Core (The "Brain")
*   **Goal:** Connect the Gemini API to the Docker Bridge and handle the execution loop.
*   **Tech Stack:** Gemini API, Socket.io.
*   **Key Tasks:**
    1.  **Socket.io Server:** Set up event handlers (`connection`, `message`).
    2.  **Gemini Loop:** Implement the logic:
        *   Receive user prompt.
        *   Send to Gemini API with tool definitions.
        *   **Interception:** If Gemini requests a tool call, emit `tool:approval_required` to the client.
    3.  **Execution:** Upon receiving approval, route the JSON-RPC request through the `DockerStreamTransport`.
    4.  **Observation:** Capture the result, feed it back to Gemini, and stream the answer via `agent:response`.

### Phase IV: Frontend & Security
*   **Goal:** Provide a user interface and lock down the infrastructure.
*   **Tech Stack:** Vue 3, Pinia, Tailwind CSS.
*   **Key Tasks:**
    1.  **Frontend Build:** Create a chat interface that supports "Approval Cards" for tool requests.
    2.  **Live Streaming:** Render `tool:output` logs in a collapsible console view for transparency.
    3.  **Security Hardening:**
        *   Configure container limits (512MB RAM, 0.5 CPU).
        *   Ensure `User` in Docker config is set to a non-root UID.
        *   Disable networking for containers by default.

## 4. Verification Strategy
Success will be measured by the following criteria:
1.  **Transport Reliability:** Unit tests verifying that `DockerStreamTransport` correctly parses split JSON chunks and ignores stderr noise.
2.  **Isolation:** Confirmation that a crashing MCP container does not affect the main Node.js process or other user sessions.
3.  **Concurrency:** Ability to handle at least 5 simultaneous active sessions without cross-talk (verified via load scripts).
4.  **Recovery:** Reloading the UI restores the previous chat state from Redis.

## 5. Anticipated Challenges & Considerations
*   **Stream Demuxing:** Docker's multiplexed stream format is binary. Incorrect parsing will break the JSON-RPC connection. We must rely heavily on `dockerode`'s built-in demuxing rather than raw parsing if possible.
*   **Zombie Containers:** If the Node.js parent process crashes, containers might be left running. We need a cleanup script or use Docker labels to identify and purge orphaned containers on startup.
*   **Latency:** The "Human-in-the-loop" approval adds latency. The UI must provide immediate feedback (spinners/logs) during the `agent:thinking` state to prevent user perceived unresponsiveness.
*   **Docker Socket Permissions:** The Node.js process needs access to `/var/run/docker.sock`. We must ensure the user running the service is in the `docker` group.
