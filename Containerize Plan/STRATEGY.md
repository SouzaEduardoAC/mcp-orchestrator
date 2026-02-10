# Plan: Containerization of MCP Orchestrator

## Executive Summary
**Goal:** Transform the current local Node.js environment into a fully containerized, reproducible architecture using Docker and Docker Compose.

**Definition of Done:**
1. A production-ready `Dockerfile` exists for the Orchestrator application.
2. A `docker-compose.yml` file orchestrates the app and its Redis dependency.
3. The Orchestrator container has valid access to the host's Docker socket to spawn sibling "sandbox" containers (`mcp-server`).
4. Network connectivity between the Orchestrator, Redis, and external APIs (Google Gemini) is established.

## Current State Analysis
*   **Application Runtime:** Node.js (TypeScript). Build required (`tsc`).
*   **Dependencies:**
    *   **Redis:** Required for `SessionManager` and `ConversationRepository`. currently defaults to `localhost:6379`.
    *   **Docker Daemon:** The app uses `dockerode` to spawn sibling containers. It *must* access `/var/run/docker.sock`.
*   **Environment:**
    *   `PORT` (default 3000).
    *   `REDIS_URL` (needed to override localhost).
    *   `GOOGLE_API_KEY` (required secret).
*   **Missing Artifact:** The codebase references an image `mcp-server:latest` in `SessionManager.ts`, but no source for this image was found. This is a prerequisite dependency.

## Step-by-Step Strategic Roadmap

### Phase 1: The Orchestrator Dockerfile
Create a multi-stage `Dockerfile` to keep the final image light and secure.
*   **Stage 1: Builder**
    *   Base: `node:22-alpine`
    *   Action: Install dependencies (including devDependencies), compile TypeScript to `dist/`.
*   **Stage 2: Production**
    *   Base: `node:22-alpine`
    *   Action: Install *only* production dependencies. Copy `dist/` from Builder.
    *   User: `node` (non-root) for security, though we need to consider the Docker group permissions.

### Phase 2: Docker Compose Orchestration
Create `docker-compose.yml` to wire the system.
*   **Service: `redis`**
    *   Image: `redis:alpine`
    *   Network: Internal overlay network.
*   **Service: `app` (Orchestrator)**
    *   Build: `.`
    *   Ports: `3000:3000`
    *   Environment Variables:
        *   `REDIS_URL=redis://redis:6379`
        *   `GOOGLE_API_KEY=${GOOGLE_API_KEY}`
    *   **Critical Configuration:** Volume mount `/var/run/docker.sock:/var/run/docker.sock` to enable sibling container management.

### Phase 3: "mcp-server" Placeholder
Since `mcp-server:latest` is required but missing, we will create a minimal `Dockerfile.mcp` to build a placeholder "worker" image. This ensures the system works out-of-the-box for testing.

## Verification & Testing Plan
1.  **Build Verification:** Run `docker compose build` to ensure TypeScript compiles within the container.
2.  **Connectivity Test:**
    *   Start services: `docker compose up -d`
    *   Check logs: Ensure `RedisFactory` connects to `redis:6379` successfully.
3.  **Docker Socket Test:**
    *   Trigger `SessionManager.acquireSession`.
    *   Verify: Does a *new* container appear in `docker ps`?
    *   Verify: Does the Orchestrator log "Session provisioned"?

## Risk Assessment
*   **Docker Socket Permissions:** The `node` user inside the container may not have permissions to write to `/var/run/docker.sock` (owned by root/docker group).
    *   *Mitigation:* We may need to run as root temporarily or align GIDs in the Compose file.
*   **mcp-server Image:** If this image is missing, the Orchestrator will throw 500 errors when users try to connect.
    *   *Mitigation:* The plan includes creating a dummy/placeholder definition for this image.
*   **Network Isolation:** The sibling containers use `NetworkMode: 'none'`. This is correct for security but makes debugging them harder.
