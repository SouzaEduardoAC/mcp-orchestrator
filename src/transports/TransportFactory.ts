import { MCPServerConfig, HttpMCPConfig, StdioMCPConfig, StdioDockerMCPConfig } from '../registry/types';
import { MCPTransport } from './base/MCPTransport';
import { HttpTransport } from './HttpTransport';
import { StdioTransport } from './StdioTransport';
import { StdioDockerTransport } from './StdioDockerTransport';
import { DockerClient } from '../infrastructure/docker/DockerClient';

/**
 * Factory for creating MCP transports based on configuration
 */
export class TransportFactory {
  /**
   * Create a transport instance from MCP server configuration
   */
  static create(config: MCPServerConfig, dockerClient?: DockerClient): MCPTransport {
    switch (config.transport) {
      case 'http':
      case 'sse':
        return this.createHttpTransport(config as HttpMCPConfig);

      case 'stdio':
        return this.createStdioTransport(config as StdioMCPConfig);

      case 'stdio-docker':
        if (!dockerClient) {
          throw new Error('DockerClient required for stdio-docker transport');
        }
        return this.createStdioDockerTransport(config as StdioDockerMCPConfig, dockerClient);

      default:
        throw new Error(`Unsupported transport type: ${(config as any).transport}`);
    }
  }

  /**
   * Create HTTP transport
   */
  private static createHttpTransport(config: HttpMCPConfig): HttpTransport {
    return new HttpTransport({
      url: config.url,
      headers: config.headers,
      timeout: config.timeout,
      healthCheckEndpoint: config.healthCheckEndpoint
    });
  }

  /**
   * Create Stdio transport
   */
  private static createStdioTransport(config: StdioMCPConfig): StdioTransport {
    return new StdioTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd
    });
  }

  /**
   * Create Stdio-Docker transport
   */
  private static createStdioDockerTransport(
    config: StdioDockerMCPConfig,
    dockerClient: DockerClient
  ): StdioDockerTransport {
    return new StdioDockerTransport(dockerClient, {
      image: config.containerImage,
      env: config.containerEnv || {},
      memory: config.containerMemory,
      cpu: config.containerCpu
    });
  }
}
