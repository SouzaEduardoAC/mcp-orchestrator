# Business Logic & Flow

## Executive Summary
The **MCP Orchestrator** serves as a secure, ephemeral runtime environment for AI Model Context Protocol (MCP) servers. It allows users to instantiate isolated workspaces (Docker containers) on-demand to execute tools safely. The system manages the lifecycle of these workspaces, ensuring they persist during active usage and are automatically recycled after periods of inactivity to optimize resource usage.

## Core Capabilities
*   **On-Demand Isolation:** Users are provisioned a dedicated, sandboxed environment (Docker container) upon request.
*   **Session Persistence:** The system "remembers" a user's workspace, allowing them to reconnect and continue executing tools without state loss within a session window.
*   **Automated Housekeeping:** A "Janitor" process continuously monitors for abandoned sessions, freeing up compute and memory resources by terminating workspaces that have been idle for more than 15 minutes.
*   **Secure Communication:** All communication between the host and the isolated workspace occurs via standard input/output streams, avoiding open network ports.

## Business Process Flow

```mermaid
sequenceDiagram
    participant User as Client / User
    participant Orch as Orchestrator (Session Manager)
    participant Cache as Session State (Redis)
    participant Docker as Container Runtime
    participant Janitor as Cleanup Service

    Note over User, Docker: Session Acquisition Flow
    User->>Orch: Request Workspace (SessionID)
    Orch->>Cache: Check for Active Session?
    alt Session Exists
        Cache-->>Orch: Return Container ID
        Orch->>Cache: Update "Last Active" Timestamp
        Orch-->>User: Session Ready
    else New Session
        Cache-->>Orch: Not Found
        Orch->>Docker: Spawn New Container
        Docker-->>Orch: Container Started (ID: abc-123)
        Orch->>Cache: Register Session (ID -> abc-123)
        Orch-->>User: Session Ready
    end

    Note over Janitor, Docker: Background Cleanup Flow (Every 1 min)
    loop Janitor Cycle
        Janitor->>Cache: Get All Sessions
        Janitor->>Janitor: Identify Idle Sessions (>15m)
        opt Idle Session Found
            Janitor->>Docker: Stop & Remove Container
            Janitor->>Cache: Delete Session Record
        end
    end
```
