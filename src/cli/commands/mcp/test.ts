import ora from 'ora';
import { ConfigStore } from '../../../registry/ConfigStore';
import { MCPRegistry } from '../../../registry/MCPRegistry';
import { TransportFactory } from '../../../transports/TransportFactory';
import { DockerClient } from '../../../infrastructure/docker/DockerClient';
import { displayTestResult, displayError } from '../../utils/display';

export async function testCommand(name: string): Promise<void> {
  const spinner = ora(`Testing connection to '${name}'...`).start();

  try {
    const configStore = new ConfigStore();
    const registry = new MCPRegistry(configStore);
    await registry.initialize();

    const config = await registry.getMCP(name);
    if (!config) {
      spinner.fail();
      displayError(`MCP server '${name}' not found`);
      process.exit(1);
    }

    // Create transport
    const dockerClient = new DockerClient();
    const transport = TransportFactory.create(config, dockerClient);

    // Connect
    spinner.text = 'Connecting to MCP server...';
    await transport.connect();

    spinner.text = 'Testing connection health...';

    // Health check
    const healthy = await transport.healthCheck();

    await transport.disconnect();

    if (!healthy) {
      spinner.fail();
      displayTestResult(name, {
        success: false,
        message: 'Health check failed',
        error: 'Server is not responding to health checks'
      });
      process.exit(1);
    }

    spinner.succeed();
    displayTestResult(name, {
      success: true,
      message: 'Connection successful and server is healthy',
      transport: config.transport
    });
  } catch (error) {
    spinner.fail();
    displayTestResult(name, {
      success: false,
      message: 'Connection failed',
      error: (error as Error).message
    });
    process.exit(1);
  }
}
