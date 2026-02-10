# Technical Specifications

## 1. System Entry Points
*   **Application Boot**: `src/index.ts` (bootstrap). Initializes Redis, Docker, and the Janitor background service.
*   **Real-time Interface**: `src/interfaces/socket/SocketRegistry.ts`. Maps WebSocket events to Agent actions.
*   **Session Orchestration**: `src/services/SessionManager.ts`. Handles idempotent session acquisition with concurrency protection.

## 2. State & Concurrency Control
*   **Distributed Locking**: 
    *   **Mechanism**: `SessionRepository.acquireLock` uses Redis `SET {key} locked NX PX 30000`.
    *   **Purpose**: Prevents "Thundering Herd" container spawning for the same `sessionId`.
*   **Persistence**:
    *   **Sessions**: Redis (`mcp:session:{id}`). Stores `containerId` and heartbeat.
    *   **History**: Redis (`history:{id}`). Stores full chat context for Gemini's stateless API.

## 3. Sandbox Security Model
*   **Resource Limits**: Configured in `DockerClient.spawnContainer`:
    *   **Memory**: 512MB (`Memory: 536870912`).
    *   **CPU**: 0.5 Cores (`NanoCpus: 500000000`).
    *   **Network**: Isolated (`NetworkMode: 'none'`).
*   **Transport**: `DockerContainerTransport` communicates via `stdin/stdout` using `docker exec` streams, avoiding network-based communication between host and guest.

## 4. Error Matrix
| Component | Failure | Recovery |
|-----------|---------|----------|
| `SessionManager` | Lock Timeout | Waits 2s, retries `getSession`, then fails. |
| `DockerClient` | Resource Exhaustion | Throws `DockerError`, caught by Socket layer and reported to UI. |
| `GeminiAgent` | Tool Mapping Error | Normalizes MCP names (e.g., `-` to `_`) to meet Gemini API specs. |
| `JanitorService` | Termination Failure | Logs error; session remains for next cycle. |

## 5. Complexity & Performance
*   **Session Cold Start**: High (Docker `create` + `start`). Reduced by session reuse.
*   **Context Rebuilding**: O(N) where N is history length. The `GeminiAgent` sends the entire history to the model on every turn to maintain state.