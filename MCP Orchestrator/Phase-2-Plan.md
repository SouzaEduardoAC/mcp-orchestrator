# Phase 2: State & Session Management - Strategic Plan

## 1. Executive Summary
**Goal:** Implement a robust state management layer that handles user sessions, maps them to ephemeral Docker containers, and automatically cleans up resources after inactivity.

**Definition of Done:**
*   `redis` client is installed and configured.
*   `SessionRegistry` service is implemented to manage the lifecycle (Spawn, Retrieve, Terminate) of user sessions.
*   A "Janitor" background service is running to detect and cull idle sessions (>15 min inactivity).
*   Unit tests verify session persistence and expiration logic using mocked infrastructure.

## 2. Current State Analysis
*   **Existing Infrastructure:**
    *   `src/infrastructure/docker/DockerClient.ts`: Available for spawning containers.
    *   `src/infrastructure/transport/DockerContainerTransport.ts`: Available for communication.
*   **Missing Components:**
    *   No persistent storage (Redis) is currently integrated.
    *   No concept of a "Session" exists in the codebase; containers are currently spawned manually via scripts.
    *   No cleanup mechanism exists (high risk of resource leaks).

## 3. Step-by-Step Strategic Roadmap

### Phase 2.1: Redis Infrastructure
**Objective:** Establish the connection to the state store.
*   **Action:** Install `redis` (Node-Redis v4+) and `@types/redis`.
*   **Create:** `src/infrastructure/cache/RedisFactory.ts`
    *   **Responsibility:** Export a singleton Redis client instance.
    *   **Config:** Connect to `process.env.REDIS_URL` (default: `redis://localhost:6379`).

### Phase 2.2: Session Domain Logic
**Objective:** Define what a "Session" is.
*   **Create:** `src/domain/session/SessionRepository.ts`
    *   **Interface:** `saveSession(id, containerId)`, `getSession(id)`, `updateHeartbeat(id)`, `deleteSession(id)`.
    *   **Implementation:** Use Redis keys (e.g., `mcp:session:{id}`).
*   **Logic:**
    *   Store metadata: `containerId`, `startTime`, `lastActive`.

### Phase 2.3: Session Manager Service
**Objective:** Orchestrate Docker and Redis.
*   **Create:** `src/services/SessionManager.ts`
*   **Methods:**
    *   `acquireSession(sessionId: string)`:
        1.  Check Redis for existing session.
        2.  If exists -> Return container info & `updateHeartbeat`.
        3.  If missing -> Call `DockerClient.spawnContainer`, save to Redis, return info.
    *   `terminateSession(sessionId: string)`:
        1.  Call `DockerClient.stopContainer`.
        2.  Remove from Redis.

### Phase 2.4: The Janitor (Cleanup Service)
**Objective:** Active resource management.
*   **Create:** `src/services/JanitorService.ts`
*   **Logic:**
    *   `run()`: `setInterval` (e.g., every 1 minute).
    *   **Scan:** Find sessions with `lastActive < (Now - 15 mins)`.
    *   **Action:** Call `SessionManager.terminateSession` for each expired ID.
    *   **Safety:** Log every termination event.

## 4. Verification & Testing Plan

### Unit Tests
*   **`SessionManager.test.ts`:**
    *   **Mock:** `DockerClient`, `RedisRepository`.
    *   **Case 1 (New):** `acquireSession` -> Spawns new container -> Saves to Redis.
    *   **Case 2 (Existing):** `acquireSession` -> Returns existing container -> Updates heartbeat.
*   **`JanitorService.test.ts`:**
    *   **Mock:** `SessionRepository` to return old sessions.
    *   **Verify:** `terminateSession` is called exactly once for each expired session.

### Integration Verification
*   **Script:** `src/scripts/test-session-lifecycle.ts`
    1.  Initialize `SessionManager`.
    2.  `acquireSession('user-123')` -> Verify Docker container starts.
    3.  Wait 2 seconds.
    4.  `acquireSession('user-123')` -> Verify SAME container ID is returned (no double spawn).
    5.  Manually trigger `Janitor` (or simulate time pass).
    6.  Verify container is stopped.

## 5. Risk Assessment
*   **Redis Dependency:** The application now strictly requires a running Redis instance. **Mitigation:** Ensure `README.md` is updated and the application fails fast (graceful exit) if Redis is unreachable on startup.
*   **Race Conditions:** Two requests for the same new session ID coming instantly might spawn two containers. **Mitigation:** Use `SETNX` (Set if Not Exists) in Redis *before* spawning the container to lock the session creation.
*   **Zombie Processes:** If the Node process is `kill -9`'d, the Janitor won't run. **Mitigation:** Accept this for Phase 2; Phase 4 Security will address strict container lifecycles or use Docker labels for external cleanup.
