# Phase 3: The Orchestrator Core (The Brain) - Strategic Plan

## 1. Executive Summary
**Goal:** Connect the Gemini API to the Docker Bridge, enabling a full conversational loop where the AI can discover tools, request execution, wait for user approval, and receive results from the sandboxed containers.

**Definition of Done:**
*   `@google/generative-ai` is installed.
*   A `Socket.io` server is running and accepting connections.
*   `GeminiAgent` service is implemented to manage the multi-turn conversation and tool execution loop.
*   `ConversationRepository` (Redis) is implemented to persist chat history.
*   The "Human-in-the-loop" flow (Tool Request -> Approval -> Execution) is functional.
*   `src/index.ts` is created as the application entry point, wiring all services together.

## 2. Current State Analysis
*   **Existing Foundation:**
    *   `SessionManager` & `JanitorService` (Phase 2) are ready to manage container lifecycles.
    *   `DockerContainerTransport` (Phase 1) is ready for MCP communication.
    *   Redis and Docker infrastructure are in place.
*   **Missing Components:**
    *   No HTTP/Socket server entry point.
    *   No integration with Google Gemini API.
    *   No conversation persistence.
    *   No logic to handle the "Ask for Permission" flow.

## 3. Step-by-Step Strategic Roadmap

### Phase 3.1: Dependencies & Infrastructure
**Objective:** Prepare the runtime environment.
*   **Action:** Install `@google/generative-ai` and `dotenv`.
*   **Create:** `src/infrastructure/http/Server.ts`
    *   Setup Express and `http.createServer`.
    *   Initialize `Socket.io` with CORS configuration.
*   **Create:** `src/domain/conversation/ConversationRepository.ts`
    *   Implement `RedisConversationRepository` to store/retrieve message history (User + Assistant + Tool calls).

### Phase 3.2: The Gemini Agent Service
**Objective:** encapsulate the logic for talking to Gemini and MCP.
*   **Create:** `src/services/GeminiAgent.ts`
*   **Scope:** One instance per active Socket connection.
*   **Responsibilities:**
    *   Maintain `McpClient` connection (using `DockerContainerTransport`).
    *   `generateResponse(userPrompt)`:
        1.  Load history.
        2.  Fetch tools from MCP.
        3.  Call Gemini API.
        4.  If text -> Save to history -> Return text.
        5.  If tool call -> Return "Approval Required" signal.
    *   `executeTool(callId)`:
        1.  Execute via MCP Client.
        2.  Feed result back to Gemini.
        3.  Return final response.

### Phase 3.3: Socket Interface
**Objective:** Handle real-time events.
*   **Create:** `src/interfaces/socket/SocketRegistry.ts`
*   **Logic:**
    *   `on('connection')`: Authenticate/Identify user (SessionID).
    *   `on('message')`: Call `GeminiAgent.generateResponse`.
    *   `on('tool:approval')`: Call `GeminiAgent.executeTool`.
    *   **Events Emitted:** `agent:thinking`, `agent:response`, `tool:approval_required`, `tool:output`.

### Phase 3.4: Application Entry Point
**Objective:** Boot the system.
*   **Create:** `src/index.ts`
    *   Initialize `RedisFactory`.
    *   Start `JanitorService`.
    *   Start `HttpServer`.
    *   Handle graceful shutdown (`SIGTERM`).

## 4. Verification & Testing Plan

### Unit Tests
*   **`GeminiAgent.test.ts`:**
    *   Mock `McpClient` and `GenerativeModel`.
    *   Test "Happy Path": User -> Gemini -> Text Response.
    *   Test "Tool Path": User -> Gemini -> Tool Call -> Halt for Approval.
*   **`ConversationRepository.test.ts`:**
    *   Verify message ordering and persistence in Redis.

### Integration Verification
*   **Script:** `src/scripts/test-gemini-loop.ts`
    *   **Simulate:** A full flow without a frontend.
    *   **Actions:**
        1.  Connect via `socket.io-client`.
        2.  Send "List files in current directory" (Requires `ls` tool).
        3.  Assert `tool:approval_required` event received.
        4.  Send `tool:approval`.
        5.  Assert `tool:output` contains file listing.
        6.  Assert `agent:response` confirms the action.

## 5. Risk Assessment
*   **Gemini API Latency:** Tool calling loops can be slow. **Mitigation:** Emit `agent:thinking` events liberally to keep UI alive.
*   **Context Window:** Long chats will hit token limits. **Mitigation:** Implement a basic sliding window in `ConversationRepository` (keep last 50 messages) for Phase 3.
*   **Tool Schema Compatibility:** Gemini's expected JSON schema might differ slightly from MCP's `zod` output. **Mitigation:** Ensure strict type conversion when passing MCP tools to Gemini.
