# AI Context (Token-Optimized)

## Project Stack
*   **Runtime:** Node.js (ES2022), TypeScript 5.9.
*   **Core SDK:** `@modelcontextprotocol/sdk` (v1.26).
*   **Infrastructure:** Docker (via `dockerode` v4), Redis (via `redis` v4).
*   **Testing:** Jest, ts-jest.

## Architecture Patterns
*   **Layered Architecture:**
    *   `src/domain` - Interfaces & Data Types (Repository Pattern).
    *   `src/infrastructure` - External adapters (Docker, Redis, Transport).
    *   `src/services` - Business logic orchestrating domains and infrastructure.
*   **Transport Pattern:** Implements MCP `Transport` interface bridging Node streams to Docker stdio.
*   **Singleton Pattern:** `RedisFactory` manages the DB connection.

## Critical Path Map
1.  **Session Creation:** `SessionManager.acquireSession` -> `RedisSessionRepository.getSession` -> (miss) -> `DockerClient.spawnContainer` -> `RedisSessionRepository.saveSession`.
2.  **Message Flow:** `Client` -> `DockerContainerTransport.send` -> `Container.stdin` -> `Process` -> `Container.stdout` -> `DockerContainerTransport.onmessage`.
3.  **Cleanup:** `JanitorService.run` -> `RedisSessionRepository.getAllSessions` -> `SessionManager.terminateSession` -> `DockerClient.stopContainer`.

## Conventions
*   **Naming:** PascalCase for Classes, camelCase for methods/variables.
*   **Async:** Heavy usage of `async/await`.
*   **Error Handling:** Try/Catch blocks in Service layer; Infrastructure layers throw raw errors.
*   **Config:** Environment variables (e.g., `process.env.REDIS_URL`).

## Constraints & Blind Spots
*   **Concurrency:** `SessionManager` lacks distributed locking (`SETNX` TODO).
*   **Scaling:** Janitor performs O(N) scan on Redis keys.
*   **Orphaned Containers:** No reconciliation on startup for pre-existing containers.
