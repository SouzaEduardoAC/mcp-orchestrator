import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { BaseMCPTransport, TransportInfo } from './base/MCPTransport';

/**
 * HTTP Transport for MCP servers with connection pooling
 * Connects to MCP servers via HTTP/REST endpoints
 *
 * Note: Node.js 18+ fetch uses undici which provides built-in connection pooling.
 * The default pool configuration is reasonable for most use cases:
 * - Max connections per origin: 10
 * - Keep-alive connections are automatically reused
 *
 * For more aggressive pooling, configure undici's global dispatcher in your app initialization.
 * See: https://undici.nodejs.org/#/docs/api/Pool
 */
export class HttpTransport extends BaseMCPTransport {
  private url: string;
  private headers: Record<string, string>;
  private timeout: number;
  private healthCheckEndpoint: string;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000;

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

  /**
   * Configure global connection pooling for fetch requests.
   * Should be called once during app initialization.
   *
   * @param options Pool configuration options
   */
  static configureConnectionPool(options: {
    maxConnections?: number;
    maxIdleConnections?: number;
  }): void {
    // Note: This requires undici to be available
    try {
      // Dynamic import to avoid errors if undici is not available
      const { setGlobalDispatcher, Agent } = require('undici');

      const dispatcher = new Agent({
        connections: options.maxConnections || 50,
        pipelining: 1,
        keepAliveTimeout: 30000,
        keepAliveMaxTimeout: 60000
      });

      setGlobalDispatcher(dispatcher);
      console.log('[HttpTransport] Connection pool configured:', options);
    } catch (error) {
      console.warn('[HttpTransport] Failed to configure connection pool. Undici may not be available:', error);
    }
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

    await this.sendWithRetry(message, 0);
  }

  private async sendWithRetry(message: JSONRPCMessage, attempt: number): Promise<void> {
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
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < HttpTransport.MAX_RETRIES) {
          const delay = HttpTransport.RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[HttpTransport] Request failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${HttpTransport.MAX_RETRIES})`);
          await this.sleep(delay);
          return this.sendWithRetry(message, attempt + 1);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      this.emitMessage(result);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      // Retry on network errors
      if (this.isRetryableError(error) && attempt < HttpTransport.MAX_RETRIES) {
        const delay = HttpTransport.RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[HttpTransport] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${HttpTransport.MAX_RETRIES})`, error);
        await this.sleep(delay);
        return this.sendWithRetry(message, attempt + 1);
      }

      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    const retryableErrors = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
    return retryableErrors.some(code => error.message?.includes(code));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
