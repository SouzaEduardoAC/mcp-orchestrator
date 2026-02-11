/**
 * MCP Registry Configuration Types
 */

export type TransportType = 'http' | 'stdio' | 'sse' | 'stdio-docker';
export type NamespacingStrategy = 'auto' | 'prefix' | 'none';

/**
 * Base configuration for all MCP servers
 */
export interface MCPServerConfigBase {
  transport: TransportType;
  enabled: boolean;
  description?: string;
  toolPrefix?: string; // Custom prefix for tool names
}

/**
 * HTTP/SSE transport configuration
 */
export interface HttpMCPConfig extends MCPServerConfigBase {
  transport: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  healthCheckEndpoint?: string;
  timeout?: number;
}

/**
 * Stdio transport configuration (local process)
 */
export interface StdioMCPConfig extends MCPServerConfigBase {
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Stdio-Docker transport configuration (current implementation)
 */
export interface StdioDockerMCPConfig extends MCPServerConfigBase {
  transport: 'stdio-docker';
  containerImage: string;
  containerEnv?: Record<string, string>;
  containerMemory?: number;
  containerCpu?: number;
}

/**
 * Union type for all MCP configurations
 */
export type MCPServerConfig = HttpMCPConfig | StdioMCPConfig | StdioDockerMCPConfig;

/**
 * Global settings for MCP registry
 */
export interface MCPRegistrySettings {
  autoConnect: boolean;
  healthCheckInterval: number;
  toolNamespacing: NamespacingStrategy;
}

/**
 * Complete MCP configuration file structure
 */
export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
  settings: MCPRegistrySettings;
}

/**
 * MCP connection test result
 */
export interface TestResult {
  success: boolean;
  message: string;
  healthCheck?: boolean;
  toolCount?: number;
  tools?: string[];
  error?: string;
}

/**
 * MCP status information
 */
export interface MCPStatus {
  name: string;
  config: MCPServerConfig;
  status: 'online' | 'offline' | 'disabled' | 'error';
  lastHealthCheck?: number;
  error?: string;
  toolCount?: number;
}
