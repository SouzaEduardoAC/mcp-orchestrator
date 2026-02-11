import ora from 'ora';
import { ConfigStore } from '../../../registry/ConfigStore';
import { MCPRegistry } from '../../../registry/MCPRegistry';
import { MCPServerConfig } from '../../../registry/types';
import { promptForMCPDetails } from '../../utils/prompts';
import { displaySuccess, displayError } from '../../utils/display';

export async function addCommand(
  name?: string,
  options?: {
    transport?: string;
    url?: string;
    command?: string;
    args?: string;
    image?: string;
    description?: string;
    header?: string[];
  }
): Promise<void> {
  const spinner = ora();

  try {
    // Initialize registry
    const configStore = new ConfigStore();
    const registry = new MCPRegistry(configStore);
    await registry.initialize();

    // Interactive mode if no options provided
    if (!options?.transport) {
      const result = await promptForMCPDetails(name);
      name = result.name;

      spinner.start(`Adding MCP server '${name}'...`);
      await registry.addMCP(name, result.config);
      spinner.succeed();

      displaySuccess(`MCP server '${name}' added successfully`);
      return;
    }

    // Non-interactive mode
    if (!name) {
      displayError('Name is required in non-interactive mode');
      process.exit(1);
    }

    let config: MCPServerConfig;

    switch (options.transport) {
      case 'http':
      case 'sse':
        if (!options.url) {
          displayError('URL is required for HTTP/SSE transport');
          process.exit(1);
        }

        const headers: Record<string, string> = {};
        if (options.header) {
          for (const header of options.header) {
            const [key, value] = header.split('=');
            if (key && value) {
              headers[key] = value;
            }
          }
        }

        config = {
          transport: options.transport,
          url: options.url,
          enabled: true,
          description: options.description,
          ...(Object.keys(headers).length > 0 && { headers })
        };
        break;

      case 'stdio':
        if (!options.command) {
          displayError('Command is required for stdio transport');
          process.exit(1);
        }

        config = {
          transport: 'stdio',
          command: options.command,
          enabled: true,
          description: options.description,
          ...(options.args && { args: options.args.split(',') })
        };
        break;

      case 'stdio-docker':
        if (!options.image) {
          displayError('Image is required for stdio-docker transport');
          process.exit(1);
        }

        config = {
          transport: 'stdio-docker',
          containerImage: options.image,
          enabled: true,
          description: options.description
        };
        break;

      default:
        displayError(`Unsupported transport type: ${options.transport}`);
        process.exit(1);
    }

    spinner.start(`Adding MCP server '${name}'...`);
    await registry.addMCP(name, config);
    spinner.succeed();

    displaySuccess(`MCP server '${name}' added successfully`);
  } catch (error) {
    spinner.fail();
    displayError((error as Error).message);
    process.exit(1);
  }
}
