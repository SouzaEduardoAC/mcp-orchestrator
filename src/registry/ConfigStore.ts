import fs from 'fs/promises';
import path from 'path';
import { MCPConfig, MCPServerConfig } from './types';

/**
 * ConfigStore handles reading and writing the MCP configuration file
 * Supports environment variable interpolation (e.g., ${VAR_NAME})
 */
export class ConfigStore {
  private configPath: string;
  private cache: MCPConfig | null = null;

  constructor(configPath?: string) {
    // Default to mcp-config.json in project root
    this.configPath = configPath || path.join(process.cwd(), 'mcp-config.json');
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<MCPConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const interpolated = this.interpolateEnvVars(content);
      const config = JSON.parse(interpolated) as MCPConfig;

      this.validateConfig(config);
      this.cache = config;

      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, create default config
        const defaultConfig = this.getDefaultConfig();
        await this.save(defaultConfig);
        return defaultConfig;
      }
      throw new Error(`Failed to load MCP config: ${(error as Error).message}`);
    }
  }

  /**
   * Save configuration to file
   */
  async save(config: MCPConfig): Promise<void> {
    try {
      this.validateConfig(config);

      const content = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, content, 'utf-8');

      this.cache = config;
    } catch (error) {
      throw new Error(`Failed to save MCP config: ${(error as Error).message}`);
    }
  }

  /**
   * Get cached config (call load() first)
   */
  getCache(): MCPConfig | null {
    return this.cache;
  }

  /**
   * Reload configuration from file
   */
  async reload(): Promise<MCPConfig> {
    this.cache = null;
    return this.load();
  }

  /**
   * Interpolate environment variables in config string
   * Supports ${VAR_NAME} syntax
   */
  private interpolateEnvVars(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        console.warn(`Warning: Environment variable ${varName} not found, leaving as ${match}`);
        return match;
      }
      return value;
    });
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: any): asserts config is MCPConfig {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('Config must have mcpServers object');
    }

    if (!config.settings || typeof config.settings !== 'object') {
      throw new Error('Config must have settings object');
    }

    // Validate settings
    const { settings } = config;
    if (typeof settings.autoConnect !== 'boolean') {
      throw new Error('settings.autoConnect must be a boolean');
    }
    if (typeof settings.healthCheckInterval !== 'number') {
      throw new Error('settings.healthCheckInterval must be a number');
    }
    if (!['auto', 'prefix', 'none'].includes(settings.toolNamespacing)) {
      throw new Error('settings.toolNamespacing must be "auto", "prefix", or "none"');
    }

    // Validate each MCP server config
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      this.validateServerConfig(name, serverConfig as any);
    }
  }

  /**
   * Validate individual MCP server configuration
   */
  private validateServerConfig(name: string, config: any): asserts config is MCPServerConfig {
    if (!config || typeof config !== 'object') {
      throw new Error(`MCP server '${name}' config must be an object`);
    }

    if (!['http', 'stdio', 'sse', 'stdio-docker'].includes(config.transport)) {
      throw new Error(`MCP server '${name}' has invalid transport: ${config.transport}`);
    }

    if (typeof config.enabled !== 'boolean') {
      throw new Error(`MCP server '${name}' must have enabled boolean`);
    }

    // Validate transport-specific fields
    switch (config.transport) {
      case 'http':
      case 'sse':
        if (!config.url || typeof config.url !== 'string') {
          throw new Error(`MCP server '${name}' must have url string for ${config.transport} transport`);
        }
        break;

      case 'stdio':
        if (!config.command || typeof config.command !== 'string') {
          throw new Error(`MCP server '${name}' must have command string for stdio transport`);
        }
        break;

      case 'stdio-docker':
        if (!config.containerImage || typeof config.containerImage !== 'string') {
          throw new Error(`MCP server '${name}' must have containerImage string for stdio-docker transport`);
        }
        break;
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): MCPConfig {
    return {
      mcpServers: {
        filesystem: {
          transport: 'stdio-docker',
          containerImage: 'mcp-server:latest',
          enabled: true,
          description: 'Local file system operations'
        }
      },
      settings: {
        autoConnect: true,
        healthCheckInterval: 60000,
        toolNamespacing: 'auto'
      }
    };
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
