import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ConfigStore } from '../registry/ConfigStore';
import { MCPRegistry } from '../registry/MCPRegistry';
import { MCPServerConfig } from '../registry/types';
import { DockerClient } from '../infrastructure/docker/DockerClient';
import { DockerContainerTransport } from '../infrastructure/transport/DockerContainerTransport';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ToolDefinition } from '../interfaces/llm/LLMProvider';

interface MCPConnection {
  name: string;
  config: MCPServerConfig;
  client: Client;
  transport: Transport;
  tools: ToolDefinition[];
}

interface NamespacedTool extends ToolDefinition {
  mcpName: string;
  originalName: string;
}

export class MCPConnectionManager {
  private connections: Map<string, MCPConnection> = new Map();
  private registry: MCPRegistry;
  private dockerClient: DockerClient;
  private toolNamespacing: 'auto' | 'prefix' | 'none' = 'auto';

  constructor(dockerClient: DockerClient) {
    const configStore = new ConfigStore();
    this.registry = new MCPRegistry(configStore);
    this.dockerClient = dockerClient;
  }

  async initialize(): Promise<void> {
    await this.registry.initialize();

    // Load settings
    const config = await this.registry['configStore'].load();
    this.toolNamespacing = config.settings?.toolNamespacing || 'auto';

    // Connect to all enabled MCPs
    const enabledMCPs = await this.registry.getEnabledMCPs();

    for (const [name, mcpConfig] of Object.entries(enabledMCPs)) {
      try {
        await this.connectToMCP(name, mcpConfig);
        console.log(`[MCPConnectionManager] Connected to MCP: ${name}`);
      } catch (error) {
        console.error(`[MCPConnectionManager] Failed to connect to ${name}:`, error);
      }
    }
  }

  private async connectToMCP(name: string, config: MCPServerConfig): Promise<void> {
    let transport: Transport;

    // Create transport based on type
    if (config.transport === 'stdio-docker') {
      if (!config.containerImage) {
        throw new Error(`MCP ${name}: containerImage required for stdio-docker transport`);
      }
      // Spawn a container for this MCP
      const container = await this.dockerClient.spawnContainer(
        config.containerImage,
        config.containerEnv || {},
        undefined, // cmd - not supported in StdioDockerMCPConfig
        config.containerMemory,
        config.containerCpu
      );
      transport = new DockerContainerTransport(container);
      await transport.start();
    } else if (config.transport === 'http' || config.transport === 'sse') {
      if (!config.url) {
        throw new Error(`MCP ${name}: url required for ${config.transport} transport`);
      }
      // Use SSE transport for both HTTP and SSE
      // Note: client.connect() will call transport.start() automatically
      // Wrap fetch with custom headers if provided
      const customFetch = config.headers
        ? (url: RequestInfo | URL, init?: RequestInit) => {
            const headers = { ...init?.headers, ...config.headers };
            return fetch(url, { ...init, headers });
          }
        : undefined;

      transport = new SSEClientTransport(new URL(config.url), customFetch ? { fetch: customFetch } : undefined);
    } else if (config.transport === 'stdio') {
      throw new Error(`stdio transport requires process spawning - not yet implemented`);
    } else {
      throw new Error(`Unknown transport type`);
    }

    // Create MCP client
    const client = new Client(
      {
        name: 'mcp-orchestrator',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    // Fetch tools
    const toolsResult = await client.listTools();
    const tools: ToolDefinition[] = toolsResult.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }));

    // Store connection
    this.connections.set(name, {
      name,
      config,
      client,
      transport,
      tools
    });
  }

  /**
   * Get all tools from all connected MCPs with namespacing applied
   */
  async getAllTools(): Promise<NamespacedTool[]> {
    const allTools: NamespacedTool[] = [];
    const toolNameCounts = new Map<string, number>();

    // Count tool name occurrences
    for (const connection of this.connections.values()) {
      for (const tool of connection.tools) {
        toolNameCounts.set(tool.name, (toolNameCounts.get(tool.name) || 0) + 1);
      }
    }

    // Apply namespacing logic
    for (const connection of this.connections.values()) {
      const shouldNamespace =
        this.toolNamespacing === 'prefix' ||
        (this.toolNamespacing === 'auto' && this.connections.size > 1);

      for (const tool of connection.tools) {
        const toolPrefix = connection.config.toolPrefix || connection.name;
        const hasConflict = (toolNameCounts.get(tool.name) || 0) > 1;

        // Apply prefix if namespacing is enabled or there's a conflict
        const namespacedName = (shouldNamespace || hasConflict)
          ? `${toolPrefix}_${tool.name}`
          : tool.name;

        allTools.push({
          ...tool,
          name: namespacedName,
          mcpName: connection.name,
          originalName: tool.name
        });
      }
    }

    return allTools;
  }

  /**
   * Execute a tool call on the appropriate MCP
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    // Find which MCP this tool belongs to
    let targetMCP: string | undefined;
    let originalToolName = toolName;

    // Try to find by namespaced name
    for (const [mcpName, connection] of this.connections.entries()) {
      const prefix = connection.config.toolPrefix || mcpName;
      if (toolName.startsWith(`${prefix}_`)) {
        targetMCP = mcpName;
        originalToolName = toolName.substring(prefix.length + 1);
        break;
      }
    }

    // If not found by prefix, try direct match
    if (!targetMCP) {
      for (const [mcpName, connection] of this.connections.entries()) {
        const hasTool = connection.tools.some(t => t.name === toolName);
        if (hasTool) {
          targetMCP = mcpName;
          originalToolName = toolName;
          break;
        }
      }
    }

    if (!targetMCP) {
      throw new Error(`Tool ${toolName} not found in any connected MCP`);
    }

    const connection = this.connections.get(targetMCP);
    if (!connection) {
      throw new Error(`MCP ${targetMCP} not connected`);
    }

    // Handle name normalization (some LLMs change - to _)
    const toolsList = await connection.client.listTools();
    const match = toolsList.tools.find(t =>
      t.name === originalToolName ||
      t.name.replace(/-/g, '_') === originalToolName
    );

    if (match) {
      originalToolName = match.name;
    }

    // Execute the tool
    const result = await connection.client.callTool({
      name: originalToolName,
      arguments: args
    });

    return result;
  }

  /**
   * Check health of a specific MCP
   */
  async checkHealth(mcpName: string): Promise<boolean> {
    const connection = this.connections.get(mcpName);
    if (!connection) {
      return false;
    }

    try {
      // Try to list tools as a health check
      const toolsResult = await Promise.race([
        connection.client.listTools(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);

      return toolsResult !== undefined;
    } catch (error) {
      console.error(`[MCPConnectionManager] Health check failed for ${mcpName}:`, error);
      return false;
    }
  }

  /**
   * Reconnect to a specific MCP
   */
  async reconnect(mcpName: string): Promise<void> {
    // Get the original config
    const enabledMCPs = await this.registry.getEnabledMCPs();
    const config = enabledMCPs[mcpName];

    if (!config) {
      throw new Error(`MCP ${mcpName} not found in registry or is disabled`);
    }

    // Disconnect existing connection
    const existingConnection = this.connections.get(mcpName);
    if (existingConnection) {
      try {
        await existingConnection.transport.close();
      } catch (error) {
        console.warn(`[MCPConnectionManager] Error closing existing connection for ${mcpName}:`, error);
      }
      this.connections.delete(mcpName);
    }

    // Reconnect
    await this.connectToMCP(mcpName, config);
    console.log(`[MCPConnectionManager] Reconnected to MCP: ${mcpName}`);
  }

  /**
   * Disconnect from a specific MCP
   */
  async disconnect(mcpName: string): Promise<void> {
    const connection = this.connections.get(mcpName);
    if (!connection) {
      return;
    }

    try {
      await connection.transport.close();
      this.connections.delete(mcpName);
      console.log(`[MCPConnectionManager] Disconnected from MCP: ${mcpName}`);
    } catch (error) {
      console.error(`[MCPConnectionManager] Error disconnecting from ${mcpName}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    for (const [name, connection] of this.connections.entries()) {
      try {
        await connection.transport.close();
        console.log(`[MCPConnectionManager] Disconnected from MCP: ${name}`);
      } catch (error) {
        console.error(`[MCPConnectionManager] Error disconnecting from ${name}:`, error);
      }
    }
    this.connections.clear();
  }

  /**
   * Get list of connected MCP names
   */
  getConnectedMCPs(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection info for a specific MCP
   */
  getConnection(mcpName: string): MCPConnection | undefined {
    return this.connections.get(mcpName);
  }
}
