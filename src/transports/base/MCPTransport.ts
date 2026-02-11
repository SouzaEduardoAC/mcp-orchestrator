import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Transport metadata
 */
export interface TransportInfo {
  type: 'http' | 'stdio' | 'sse' | 'stdio-docker';
  endpoint?: string;
  pid?: number;
  containerId?: string;
}

/**
 * Base interface for all MCP transports
 * Abstracts communication layer for different MCP server types
 */
export interface MCPTransport {
  /**
   * Connect to the MCP server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the MCP server
   */
  disconnect(): Promise<void>;

  /**
   * Check if transport is currently connected
   */
  isConnected(): boolean;

  /**
   * Send a JSON-RPC message to the MCP server
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Set handler for incoming messages
   */
  onMessage(handler: (message: JSONRPCMessage) => void): void;

  /**
   * Set handler for errors
   */
  onError(handler: (error: Error) => void): void;

  /**
   * Set handler for connection close
   */
  onClose(handler: () => void): void;

  /**
   * Perform health check on the MCP server
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get transport metadata
   */
  getInfo(): TransportInfo;
}

/**
 * Abstract base class for MCP transports
 * Provides common functionality
 */
export abstract class BaseMCPTransport implements MCPTransport {
  protected connected: boolean = false;
  protected messageHandler?: (message: JSONRPCMessage) => void;
  protected errorHandler?: (error: Error) => void;
  protected closeHandler?: () => void;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: JSONRPCMessage): Promise<void>;
  abstract healthCheck(): Promise<boolean>;
  abstract getInfo(): TransportInfo;

  isConnected(): boolean {
    return this.connected;
  }

  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  protected emitMessage(message: JSONRPCMessage): void {
    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }

  protected emitError(error: Error): void {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }

  protected emitClose(): void {
    this.connected = false;
    if (this.closeHandler) {
      this.closeHandler();
    }
  }
}
