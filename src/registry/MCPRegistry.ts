import { EventEmitter } from 'events';
import { ConfigStore } from './ConfigStore';
import { MCPServerConfig, MCPConfig, TestResult, MCPStatus } from './types';

/**
 * MCPRegistry manages MCP server configurations
 * Provides CRUD operations and event notifications
 */
export class MCPRegistry extends EventEmitter {
  constructor(private configStore: ConfigStore) {
    super();
  }

  /**
   * Initialize the registry (load config)
   */
  async initialize(): Promise<void> {
    await this.configStore.load();
  }

  /**
   * Add a new MCP server
   */
  async addMCP(name: string, config: MCPServerConfig): Promise<void> {
    const currentConfig = await this.configStore.load();

    if (currentConfig.mcpServers[name]) {
      throw new Error(`MCP server '${name}' already exists`);
    }

    currentConfig.mcpServers[name] = config;
    await this.configStore.save(currentConfig);

    this.emit('mcpAdded', name, config);
    this.emit('configChanged');
  }

  /**
   * Remove an MCP server
   */
  async removeMCP(name: string): Promise<void> {
    const currentConfig = await this.configStore.load();

    if (!currentConfig.mcpServers[name]) {
      throw new Error(`MCP server '${name}' not found`);
    }

    delete currentConfig.mcpServers[name];
    await this.configStore.save(currentConfig);

    this.emit('mcpRemoved', name);
    this.emit('configChanged');
  }

  /**
   * Update an existing MCP server configuration
   */
  async updateMCP(name: string, updates: Partial<MCPServerConfig>): Promise<void> {
    const currentConfig = await this.configStore.load();

    if (!currentConfig.mcpServers[name]) {
      throw new Error(`MCP server '${name}' not found`);
    }

    currentConfig.mcpServers[name] = {
      ...currentConfig.mcpServers[name],
      ...updates
    } as MCPServerConfig;

    await this.configStore.save(currentConfig);

    this.emit('mcpUpdated', name, currentConfig.mcpServers[name]);
    this.emit('configChanged');
  }

  /**
   * Get a specific MCP server configuration
   */
  async getMCP(name: string): Promise<MCPServerConfig | null> {
    const config = await this.configStore.load();
    return config.mcpServers[name] || null;
  }

  /**
   * List all MCP servers
   */
  async listMCPs(): Promise<Record<string, MCPServerConfig>> {
    const config = await this.configStore.load();
    return config.mcpServers;
  }

  /**
   * Enable an MCP server
   */
  async enableMCP(name: string): Promise<void> {
    await this.updateMCP(name, { enabled: true });
  }

  /**
   * Disable an MCP server
   */
  async disableMCP(name: string): Promise<void> {
    await this.updateMCP(name, { enabled: false });
  }

  /**
   * Get all enabled MCP servers
   */
  async getEnabledMCPs(): Promise<Record<string, MCPServerConfig>> {
    const allMCPs = await this.listMCPs();
    const enabled: Record<string, MCPServerConfig> = {};

    for (const [name, config] of Object.entries(allMCPs)) {
      if (config.enabled) {
        enabled[name] = config;
      }
    }

    return enabled;
  }

  /**
   * Get MCPs by transport type
   */
  async getMCPsByTransport(transport: string): Promise<Record<string, MCPServerConfig>> {
    const allMCPs = await this.listMCPs();
    const filtered: Record<string, MCPServerConfig> = {};

    for (const [name, config] of Object.entries(allMCPs)) {
      if (config.transport === transport) {
        filtered[name] = config;
      }
    }

    return filtered;
  }

  /**
   * Check if an MCP exists
   */
  async exists(name: string): Promise<boolean> {
    const config = await this.getMCP(name);
    return config !== null;
  }

  /**
   * Get registry settings
   */
  async getSettings(): Promise<MCPConfig['settings']> {
    const config = await this.configStore.load();
    return config.settings;
  }

  /**
   * Update registry settings
   */
  async updateSettings(updates: Partial<MCPConfig['settings']>): Promise<void> {
    const currentConfig = await this.configStore.load();

    currentConfig.settings = {
      ...currentConfig.settings,
      ...updates
    };

    await this.configStore.save(currentConfig);

    this.emit('settingsUpdated', currentConfig.settings);
    this.emit('configChanged');
  }

  /**
   * Get the configuration file path
   */
  getConfigPath(): string {
    return this.configStore.getConfigPath();
  }

  /**
   * Reload configuration from file
   */
  async reload(): Promise<void> {
    await this.configStore.reload();
    this.emit('configReloaded');
  }

  /**
   * Export configuration as JSON string
   */
  async exportConfig(): Promise<string> {
    const config = await this.configStore.load();
    return JSON.stringify(config, null, 2);
  }

  /**
   * Import configuration from JSON string
   */
  async importConfig(jsonConfig: string): Promise<void> {
    const config = JSON.parse(jsonConfig) as MCPConfig;
    await this.configStore.save(config);
    this.emit('configImported');
    this.emit('configChanged');
  }
}
