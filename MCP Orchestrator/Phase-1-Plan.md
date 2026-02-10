# Phase 1: Docker Pipe Bridge (Foundation) - Strategic Plan

## 1. Executive Summary
**Goal:** Establish the foundational communication layer that enables the Node.js orchestrator to spawn ephemeral Docker containers and communicate with them via the Model Context Protocol (MCP) using standard input/output (stdio) streams.

**Definition of Done:**
*   A TypeScript project is initialized with necessary dependencies.
*   A `DockerClient` service is implemented to manage container lifecycles.
*   A custom `DockerContainerTransport` class is fully implemented, adhering to the `@modelcontextprotocol/sdk` Transport interface.
*   A "Smoke Test" script successfully spawns a container, sends a JSON-RPC message via `stdin`, and receives a valid response via `stdout`.

## 2. Current State Analysis
*   **Status:** Greenfield. The repository is currently empty (save for `LICENSE` and documentation).
*   **Discrepancy Note:** The provided `Strategic-Plan.md` references a directory `mcp-gateway`, but we are executing in `mcp-orchestrator`. We will proceed in the current `mcp-orchestrator` root.
*   **Architectural Constraint:** We must implement the `Transport` interface from the MCP SDK to ensure compatibility with the standard protocol parsers.

## 3. Step-by-Step Strategic Roadmap

### Phase 1.1: Project Scaffolding
**Objective:** Set up the TypeScript environment and install core dependencies.
*   **Action:** Initialize `package.json`.
*   **Action:** Configure `tsconfig.json` (Target ES2022, Strict Mode).
*   **Dependencies:**
    *   `dockerode`: For Docker engine interaction.
    *   `@modelcontextprotocol/sdk`: For protocol types and interfaces.
    *   `zod`: For schema validation.
    *   `express` & `socket.io` (Preliminary install for future phases).
    *   `typescript`, `ts-node`, `@types/node`, `@types/dockerode` (Dev).

### Phase 1.2: Docker Infrastructure
**Objective:** Create the wrapper service for Docker operations.
*   **Create:** `src/infrastructure/docker/DockerClient.ts`
*   **Responsibility:**
    *   Initialize the `dockerode` instance.
    *   Provide a method `spawnContainer(image: string, env: Record<string, string>)` that returns the container handle.
    *   Ensure the container is started with `Tty: false`, `OpenStdin: true`, and `AttachStdin/Stdout/Stderr: true`.

### Phase 1.3: The Transport Layer (Core Task)
**Objective:** Implement the custom transport that bridges Node.js Streams to Docker Streams.
*   **Create:** `src/infrastructure/transport/DockerContainerTransport.ts`
*   **Logic:**
    *   **Start:** Attach to the running container stream. Use `dockerode.modem.demuxStream` to separate the multiplexed stream into `stdout` (Protocol) and `stderr` (Logs).
    *   **Send:** Write JSON-RPC messages directly to the container's `stdin`.
    *   **Receive:** Pipe the demuxed `stdout` into the MCP protocol parser.
    *   **Error Handling:** Route `stderr` to a logger (critical for debugging crashed containers).

### Phase 1.4: Integration Verification
**Objective:** Prove it works without a full UI.
*   **Create:** `src/scripts/test-transport.ts`
*   **Test Case:**
    1.  Pull a simple image (e.g., `alpine` or `node:18-alpine`).
    2.  Spawn it with a command that acts as a simple echo server or a mock MCP server.
    3.  Instantiate `DockerContainerTransport`.
    4.  Send a `ping` message.
    5.  Assert that the response is received.

## 4. Verification & Testing Plan
*   **Unit Tests:**
    *   Test `DockerContainerTransport` with a *mock* stream to verify it handles split chunks (JSON packets split across stream events) correctly.
*   **Integration Tests:**
    *   **Real Container Test:** Run the `test-transport.ts` script.
    *   **Cleanup Test:** Ensure that when the node process exits, the Docker container is killed (handling `SIGINT`/`SIGTERM`).

## 5. Risk Assessment
*   **Stream Demultiplexing:** Docker raw streams contain header bytes (8-byte header per frame). If we don't use `demuxStream` correctly, the JSON parser will crash on these binary headers.
*   **Permissions:** The host user must have access to `/var/run/docker.sock`. If `permission denied` occurs, the user needs to be added to the `docker" group.
*   **Zombie Processes:** Development cycles often leave orphaned containers. We will implement a temporary "nuke all" script for the dev environment.
