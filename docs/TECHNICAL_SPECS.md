# Technical Implementation Details

## 1. Session Management
**Class:** `SessionManager` (`src/services/SessionManager.ts`)

### 1.1 Acquisition (`acquireSession`)
*   **Trigger:** Function call (Service entry point).
*   **Logic:**
    1.  Queries `SessionRepository.getSession(sessionId)`.
    2.  **IF Found:** Calls `updateHeartbeat` to refresh TTL; returns existing `SessionData`.
    3.  **IF Missing:**
        *   Invokes `DockerClient.spawnContainer`.
        *   Persists mapping in Redis via `SessionRepository.saveSession`.
        *   Returns new `SessionData`.
*   **Validations:** None explicit on inputs (assumes valid strings).
*   **External Dependencies:**
    *   **Redis:** For state lookups.
    *   **Docker Daemon:** For container provisioning.
*   **Complexity (Yellow Hat):**
    *   **Race Condition:** There is a known race condition where two simultaneous requests for the same `sessionId` could spawn two containers. A `TODO` exists to implement `SETNX` locking.
*   **Blind Spots:** Does not currently handle Docker resource limits (CPU/RAM) dynamically per user tier.

### 1.2 Termination (`terminateSession`)
*   **Trigger:** Manual call or Janitor.
*   **Logic:**
    1.  Retrieves session metadata.
    2.  Stops/Removes container via `DockerClient`.
    3.  Deletes Redis key.
*   **Blind Spots:** If Docker removal fails (e.g., daemon down), Redis key might still be deleted, leaving an orphaned container (Zombie process).

## 2. Background Cleanup
**Class:** `JanitorService` (`src/services/JanitorService.ts`)

*   **Trigger:** `setInterval` (Default: 60s).
*   **Logic:** Iterates *all* sessions in Redis. Checks `lastActive` vs `MAX_IDLE_TIME_MS` (15 min). Calls `SessionManager.terminateSession` for matches.
*   **Black Hat Risks:**
    *   **Scaling:** `getAllSessions()` uses `KEYS *` (or equivalent scan in repo implementation), which is O(N). As session count grows to thousands, this will block the Redis thread.
    *   **Distributed State:** If multiple Orchestrator instances run, multiple Janitors will race to kill the same containers.

## 3. Communication Transport
**Class:** `DockerContainerTransport` (`src/infrastructure/transport/DockerContainerTransport.ts`)

*   **Role:** Implements `@modelcontextprotocol/sdk` Transport interface.
*   **Mechanism:**
    *   Attaches to Docker container's `stdin`, `stdout`, `stderr`.
    *   **Demultiplexing:** Uses `dockerode.modem.demuxStream` to strip Docker header bytes (8-byte frame).
    *   **Protocol:** JSON-RPC over stdio.
    *   **Buffering:** Uses `ReadBuffer` to handle split TCP/Stream chunks before parsing JSON.
*   **Blind Spots:** `stderr` is currently just logged to `console.error`. It is not transmitted back to the user or stored in a structured log for debugging agent crashes.

## Data Dictionary

| Concept | Type | Location | Description |
| :--- | :--- | :--- | :--- |
| **SessionID** | `string` | `SessionManager` | Unique identifier for a user context. |
| **ContainerID** | `string` | `DockerClient` | SHA256 hash returned by Docker Daemon. |
| **SessionData** | `Interface` | `SessionRepository` | `{ containerId: string, startTime: number, lastActive: number }` |
