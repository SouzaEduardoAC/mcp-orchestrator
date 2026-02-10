# Phase 4: Frontend & Security - Strategic Plan

## 1. Executive Summary
**Goal:** Deliver a modern, "Human-in-the-loop" User Interface for the MCP Orchestrator and harden the backend infrastructure for secure multi-tenant usage.

**Definition of Done:**
*   **Security:** Docker containers run with strictly limited resources (512MB RAM, 0.5 CPU) and disabled networking.
*   **Frontend:** A Single Page Application (SPA) is served, enabling users to:
    *   Chat with Gemini.
    *   See "Thinking" states.
    *   Review and Approve/Reject tool execution requests via "Approval Cards".
    *   View streaming tool outputs.
*   **Integration:** The frontend successfully connects to the existing Socket.IO backend.

## 2. Current State Analysis
*   **Backend:** Functional Socket.IO server with Gemini integration (Phase 3).
*   **Infrastructure:** Docker spawning logic exists but lacks resource limits (Phase 1).
*   **Missing:**
    *   No graphical user interface (currently relying on CLI scripts).
    *   Containers are running with default unlimited resources (Security Risk).

## 3. Step-by-Step Strategic Roadmap

### Phase 4.1: Security Hardening (Backend)
**Objective:** Lock down the container runtime.
*   **File:** `src/infrastructure/docker/DockerClient.ts`
*   **Action:** Update `spawnContainer` to include `HostConfig`:
    *   `Memory`: 512MB (prevent OOM DoS).
    *   `NanoCpus`: 500000000 (0.5 CPU).
    *   `NetworkMode`: `none` (Isolation).
    *   `User`: `1000:1000` (Non-root execution, if supported by image, else `0` but isolated).

### Phase 4.2: Frontend Scaffolding
**Objective:** Initialize the UI codebase.
*   **Action:** Create a `public` directory to serve static assets.
*   **Tech Stack:** Plain HTML/CSS/JS (Vue 3 via CDN for simplicity in this mono-repo structure, avoiding a complex build step for now, or a simple Vite build if preferred. Given the constraints, a robust single HTML file with Vue 3 ESM is efficient).
*   **File:** `public/index.html`
    *   Import Vue 3, Socket.io-client, TailwindCSS (via CDN).
    *   Scaffold the Chat Layout.

### Phase 4.3: Chat Interface Implementation
**Objective:** Connect UI to Socket Registry.
*   **Logic (Vue App):**
    *   **State:** `messages` array, `isConnected`, `sessionId`.
    *   **Socket Events:**
        *   `agent:response` -> Append to `messages`.
        *   `tool:approval_required` -> Add a special "Approval Card" message type.
        *   `tool:output` -> Update the card with results.
    *   **Actions:**
        *   `sendMessage`: Emit `message`.
        *   `approveTool`: Emit `tool:approval` `{ approved: true }`.
        *   `rejectTool`: Emit `tool:approval` `{ approved: false }`.

### Phase 4.4: Static File Serving
**Objective:** Serve the UI from the main application.
*   **File:** `src/infrastructure/http/Server.ts`
*   **Action:** Configure Express to serve static files from `public/`.

## 4. Verification & Testing Plan

### Security Verification
*   **Unit Test:** Update `DockerClient.test.ts` (if exists or create new) to verify `createContainer` is called with `HostConfig` limits.
*   **Manual Check:** Run `docker inspect` on a spawned container to verify `Memory` and `NetworkMode`.

### Frontend Integration
*   **Manual User Test:**
    1.  Open browser to `http://localhost:3000`.
    2.  Type "List files".
    3.  Verify "Approval Card" appears.
    4.  Click "Approve".
    5.  Verify tool output is displayed.

## 5. Risk Assessment
*   **CORS:** Browser might block socket connection if not served from same origin. **Mitigation:** We are serving frontend from the same Express instance, so Same-Origin policy applies (safe).
*   **Container User Permissions:** Setting `User: 1000` might break images that expect root (like `alpine` sometimes for certain ops). **Mitigation:** We will test with `alpine` and revert to root-in-container if strictly necessary, but prefer isolation.
