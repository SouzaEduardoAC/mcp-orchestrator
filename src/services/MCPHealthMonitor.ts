import { EventEmitter } from 'events';
import { MCPConnectionManager } from './MCPConnectionManager';

export type MCPHealthStatus = 'healthy' | 'unhealthy' | 'reconnecting' | 'disconnected';

export interface MCPHealth {
  name: string;
  status: MCPHealthStatus;
  lastCheck: number;
  lastSuccess: number;
  consecutiveFailures: number;
  error?: string;
}

export interface HealthMonitorEvents {
  'health-changed': (name: string, health: MCPHealth) => void;
  'mcp-unhealthy': (name: string, health: MCPHealth) => void;
  'mcp-healthy': (name: string, health: MCPHealth) => void;
  'reconnect-attempt': (name: string, attempt: number) => void;
  'reconnect-success': (name: string) => void;
  'reconnect-failed': (name: string, error: string) => void;
}

export class MCPHealthMonitor extends EventEmitter {
  private healthStatus: Map<string, MCPHealth> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private isMonitoring = false;

  // Configuration
  private healthCheckInterval: number;
  private maxConsecutiveFailures = 3;
  private reconnectDelay = 5000; // 5 seconds
  private maxReconnectAttempts = 5;
  private circuitBreakerThreshold = 3;

  constructor(
    private connectionManager: MCPConnectionManager,
    healthCheckInterval = 60000 // 60 seconds default
  ) {
    super();
    this.healthCheckInterval = healthCheckInterval;
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      console.warn('[MCPHealthMonitor] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log(`[MCPHealthMonitor] Started with interval ${this.healthCheckInterval}ms`);

    // Initialize health status for all connected MCPs
    const connectedMCPs = this.connectionManager.getConnectedMCPs();
    for (const mcpName of connectedMCPs) {
      this.initializeHealthStatus(mcpName);
    }

    // Run initial health check
    this.runHealthChecks();

    // Schedule periodic checks
    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Clear all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    console.log('[MCPHealthMonitor] Stopped');
  }

  /**
   * Run health checks on all connected MCPs
   */
  private async runHealthChecks(): Promise<void> {
    const connectedMCPs = this.connectionManager.getConnectedMCPs();

    for (const mcpName of connectedMCPs) {
      // Skip if already reconnecting
      const health = this.healthStatus.get(mcpName);
      if (health?.status === 'reconnecting') {
        continue;
      }

      await this.checkMCPHealth(mcpName);
    }
  }

  /**
   * Check health of a specific MCP
   */
  private async checkMCPHealth(mcpName: string): Promise<void> {
    const health = this.healthStatus.get(mcpName);
    if (!health) {
      this.initializeHealthStatus(mcpName);
      return;
    }

    try {
      // Perform health check via connection manager
      const isHealthy = await this.connectionManager.checkHealth(mcpName);

      if (isHealthy) {
        this.handleHealthyCheck(mcpName, health);
      } else {
        this.handleUnhealthyCheck(mcpName, health, 'Health check returned false');
      }
    } catch (error) {
      this.handleUnhealthyCheck(
        mcpName,
        health,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Handle successful health check
   */
  private handleHealthyCheck(mcpName: string, health: MCPHealth): void {
    const wasUnhealthy = health.status === 'unhealthy';

    health.status = 'healthy';
    health.lastCheck = Date.now();
    health.lastSuccess = Date.now();
    health.consecutiveFailures = 0;
    delete health.error;

    this.emit('health-changed', mcpName, health);

    if (wasUnhealthy) {
      console.log(`[MCPHealthMonitor] MCP '${mcpName}' is now healthy`);
      this.emit('mcp-healthy', mcpName, health);
    }
  }

  /**
   * Handle failed health check
   */
  private handleUnhealthyCheck(mcpName: string, health: MCPHealth, error: string): void {
    const wasHealthy = health.status === 'healthy';

    health.status = 'unhealthy';
    health.lastCheck = Date.now();
    health.consecutiveFailures++;
    health.error = error;

    this.emit('health-changed', mcpName, health);

    if (wasHealthy) {
      console.warn(`[MCPHealthMonitor] MCP '${mcpName}' is now unhealthy: ${error}`);
      this.emit('mcp-unhealthy', mcpName, health);
    }

    // Check if we should trigger reconnection (circuit breaker pattern)
    if (health.consecutiveFailures >= this.circuitBreakerThreshold) {
      this.scheduleReconnect(mcpName, health);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(mcpName: string, health: MCPHealth): void {
    // Don't schedule if already reconnecting
    if (this.reconnectTimers.has(mcpName)) {
      return;
    }

    if (health.consecutiveFailures > this.maxReconnectAttempts) {
      console.error(
        `[MCPHealthMonitor] Max reconnect attempts reached for '${mcpName}', giving up`
      );
      health.status = 'disconnected';
      return;
    }

    console.log(
      `[MCPHealthMonitor] Scheduling reconnect for '${mcpName}' in ${this.reconnectDelay}ms`
    );

    const timer = setTimeout(() => {
      this.attemptReconnect(mcpName, health);
    }, this.reconnectDelay);

    this.reconnectTimers.set(mcpName, timer);
  }

  /**
   * Attempt to reconnect to an MCP
   */
  private async attemptReconnect(mcpName: string, health: MCPHealth): Promise<void> {
    this.reconnectTimers.delete(mcpName);

    health.status = 'reconnecting';
    this.emit('health-changed', mcpName, health);
    this.emit('reconnect-attempt', mcpName, health.consecutiveFailures);

    console.log(`[MCPHealthMonitor] Attempting to reconnect '${mcpName}'...`);

    try {
      await this.connectionManager.reconnect(mcpName);

      // Verify reconnection with health check
      const isHealthy = await this.connectionManager.checkHealth(mcpName);

      if (isHealthy) {
        health.status = 'healthy';
        health.lastSuccess = Date.now();
        health.consecutiveFailures = 0;
        delete health.error;

        console.log(`[MCPHealthMonitor] Successfully reconnected '${mcpName}'`);
        this.emit('reconnect-success', mcpName);
        this.emit('mcp-healthy', mcpName, health);
      } else {
        throw new Error('Health check failed after reconnection');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      health.error = errorMessage;
      health.consecutiveFailures++;

      console.error(`[MCPHealthMonitor] Reconnection failed for '${mcpName}': ${errorMessage}`);
      this.emit('reconnect-failed', mcpName, errorMessage);

      // Schedule another attempt if under limit
      if (health.consecutiveFailures <= this.maxReconnectAttempts) {
        this.scheduleReconnect(mcpName, health);
      } else {
        health.status = 'disconnected';
        this.emit('health-changed', mcpName, health);
      }
    }
  }

  /**
   * Initialize health status for an MCP
   */
  private initializeHealthStatus(mcpName: string): void {
    const health: MCPHealth = {
      name: mcpName,
      status: 'healthy',
      lastCheck: Date.now(),
      lastSuccess: Date.now(),
      consecutiveFailures: 0
    };

    this.healthStatus.set(mcpName, health);
  }

  /**
   * Get health status for a specific MCP
   */
  getHealth(mcpName: string): MCPHealth | undefined {
    return this.healthStatus.get(mcpName);
  }

  /**
   * Get health status for all MCPs
   */
  getAllHealth(): Map<string, MCPHealth> {
    return new Map(this.healthStatus);
  }

  /**
   * Get summary of health statuses
   */
  getHealthSummary(): {
    total: number;
    healthy: number;
    unhealthy: number;
    reconnecting: number;
    disconnected: number;
  } {
    const summary = {
      total: this.healthStatus.size,
      healthy: 0,
      unhealthy: 0,
      reconnecting: 0,
      disconnected: 0
    };

    for (const health of this.healthStatus.values()) {
      summary[health.status]++;
    }

    return summary;
  }

  /**
   * Manually trigger health check for specific MCP
   */
  async triggerHealthCheck(mcpName: string): Promise<MCPHealth | undefined> {
    await this.checkMCPHealth(mcpName);
    return this.healthStatus.get(mcpName);
  }

  /**
   * Force reconnect for specific MCP
   */
  async forceReconnect(mcpName: string): Promise<void> {
    const health = this.healthStatus.get(mcpName);
    if (!health) {
      throw new Error(`MCP '${mcpName}' not found in health monitor`);
    }

    // Clear any pending reconnect
    const existingTimer = this.reconnectTimers.get(mcpName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.reconnectTimers.delete(mcpName);
    }

    await this.attemptReconnect(mcpName, health);
  }
}
