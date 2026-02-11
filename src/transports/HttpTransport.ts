import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { BaseMCPTransport, TransportInfo } from './base/MCPTransport';

/**
 * HTTP Transport for MCP servers
 * Connects to MCP servers via HTTP/REST endpoints
 */
export class HttpTransport extends BaseMCPTransport {
  private url: string;
  private headers: Record<string, string>;
  private timeout: number;
  private healthCheckEndpoint: string;

  constructor(config: {
    url: string;
    headers?: Record<string, string>;
    timeout?: number;
    healthCheckEndpoint?: string;
  }) {
    super();
    this.url = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.headers = config.headers || {};
    this.timeout = config.timeout || 30000;
    this.healthCheckEndpoint = config.healthCheckEndpoint || '/health';
  }

  async connect(): Promise<void> {
    try {
      // Test connection with health check
      const healthy = await this.healthCheck();
      if (!healthy) {
        throw new Error(`Health check failed for ${this.url}`);
      }

      this.connected = true;
      console.log(`[HttpTransport] Connected to ${this.url}`);
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to ${this.url}: ${(error as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitClose();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.url}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify(message),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      this.emitMessage(result);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.url}${this.healthCheckEndpoint}`, {
        method: 'GET',
        headers: this.headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      console.error(`[HttpTransport] Health check failed:`, error);
      return false;
    }
  }

  getInfo(): TransportInfo {
    return {
      type: 'http',
      endpoint: this.url
    };
  }
}
