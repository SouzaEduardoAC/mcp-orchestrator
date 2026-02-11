import inquirer from 'inquirer';
import { TransportType, MCPServerConfig } from '../../registry/types';

/**
 * Interactive prompts for CLI
 */

export async function promptForMCPDetails(name?: string): Promise<{ name: string; config: MCPServerConfig }> {
  // Ask for name if not provided
  const nameAnswer = name ? { name } : await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'MCP Server name:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Name is required';
        }
        if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
          return 'Name can only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      }
    }
  ]);

  // Ask for transport type
  const { transport } = await inquirer.prompt([
    {
      type: 'list',
      name: 'transport',
      message: 'Transport type:',
      choices: [
        { name: 'HTTP - REST/HTTP-based MCP server', value: 'http' },
        { name: 'Stdio - Local process via stdin/stdout', value: 'stdio' },
        { name: 'Stdio-Docker - Docker container via stdin/stdout', value: 'stdio-docker' },
        { name: 'SSE - Server-Sent Events', value: 'sse' }
      ]
    }
  ]);

  // Ask for description
  const { description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
      default: ''
    }
  ]);

  // Ask for transport-specific details
  let config: MCPServerConfig;

  switch (transport) {
    case 'http':
    case 'sse':
      config = await promptForHttpConfig(transport, description);
      break;
    case 'stdio':
      config = await promptForStdioConfig(description);
      break;
    case 'stdio-docker':
      config = await promptForStdioDockerConfig(description);
      break;
    default:
      throw new Error(`Unsupported transport: ${transport}`);
  }

  return { name: nameAnswer.name, config };
}

async function promptForHttpConfig(transport: 'http' | 'sse', description: string): Promise<MCPServerConfig> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'URL:',
      validate: (input: string) => {
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return 'URL must start with http:// or https://';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'addHeaders',
      message: 'Add custom headers?',
      default: false
    }
  ]);

  let headers: Record<string, string> = {};
  if (answers.addHeaders) {
    let addMore = true;
    while (addMore) {
      const headerAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'key',
          message: 'Header name:',
          validate: (input: string) => input.length > 0 || 'Header name is required'
        },
        {
          type: 'input',
          name: 'value',
          message: 'Header value:',
          validate: (input: string) => input.length > 0 || 'Header value is required'
        },
        {
          type: 'confirm',
          name: 'continue',
          message: 'Add another header?',
          default: false
        }
      ]);

      headers[headerAnswer.key] = headerAnswer.value;
      addMore = headerAnswer.continue;
    }
  }

  return {
    transport,
    url: answers.url,
    enabled: true,
    description,
    ...(Object.keys(headers).length > 0 && { headers })
  };
}

async function promptForStdioConfig(description: string): Promise<MCPServerConfig> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'command',
      message: 'Command to run:',
      validate: (input: string) => input.length > 0 || 'Command is required'
    },
    {
      type: 'input',
      name: 'args',
      message: 'Arguments (space-separated, optional):',
      default: ''
    },
    {
      type: 'input',
      name: 'cwd',
      message: 'Working directory (optional):',
      default: ''
    }
  ]);

  return {
    transport: 'stdio',
    command: answers.command,
    enabled: true,
    description,
    ...(answers.args && { args: answers.args.split(' ').filter((s: string) => s.length > 0) }),
    ...(answers.cwd && { cwd: answers.cwd })
  };
}

async function promptForStdioDockerConfig(description: string): Promise<MCPServerConfig> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'containerImage',
      message: 'Docker image:',
      validate: (input: string) => input.length > 0 || 'Image is required'
    },
    {
      type: 'number',
      name: 'containerMemory',
      message: 'Memory limit (MB, optional):',
      default: 512
    },
    {
      type: 'number',
      name: 'containerCpu',
      message: 'CPU limit (cores, optional):',
      default: 0.5
    }
  ]);

  return {
    transport: 'stdio-docker',
    containerImage: answers.containerImage,
    enabled: true,
    description,
    ...(answers.containerMemory && { containerMemory: answers.containerMemory }),
    ...(answers.containerCpu && { containerCpu: answers.containerCpu })
  };
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: false
    }
  ]);

  return confirmed;
}
