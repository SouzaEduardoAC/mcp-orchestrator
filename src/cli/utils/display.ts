import chalk from 'chalk';
import Table from 'cli-table3';
import { MCPServerConfig, MCPStatus } from '../../registry/types';

/**
 * Display utilities for CLI output
 */

export function displaySuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function displayError(message: string): void {
  console.log(chalk.red('✗'), message);
}

export function displayWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

export function displayInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function displayMCPList(mcps: Record<string, MCPServerConfig>): void {
  if (Object.keys(mcps).length === 0) {
    displayWarning('No MCP servers configured');
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('Name'),
      chalk.cyan('Transport'),
      chalk.cyan('Status'),
      chalk.cyan('Description')
    ],
    colWidths: [20, 15, 12, 50]
  });

  for (const [name, config] of Object.entries(mcps)) {
    const status = config.enabled
      ? chalk.green('✓ Enabled')
      : chalk.gray('⊘ Disabled');

    table.push([
      chalk.white(name),
      chalk.yellow(config.transport),
      status,
      chalk.gray(config.description || 'N/A')
    ]);
  }

  console.log(table.toString());
}

export function displayMCPInfo(name: string, config: MCPServerConfig): void {
  console.log();
  console.log(chalk.bold.cyan('MCP Server Information'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white('Name:'), chalk.green(name));
  console.log(chalk.white('Transport:'), chalk.yellow(config.transport));
  console.log(chalk.white('Status:'), config.enabled ? chalk.green('✓ Enabled') : chalk.gray('⊘ Disabled'));
  console.log(chalk.white('Description:'), chalk.gray(config.description || 'N/A'));
  console.log();

  // Transport-specific details
  switch (config.transport) {
    case 'http':
    case 'sse':
      console.log(chalk.white('URL:'), chalk.blue(config.url));
      if (config.headers && Object.keys(config.headers).length > 0) {
        console.log(chalk.white('Headers:'));
        for (const [key, value] of Object.entries(config.headers)) {
          console.log(`  ${chalk.gray(key)}: ${chalk.gray(value)}`);
        }
      }
      if (config.healthCheckEndpoint) {
        console.log(chalk.white('Health Check:'), chalk.gray(config.healthCheckEndpoint));
      }
      if (config.timeout) {
        console.log(chalk.white('Timeout:'), chalk.gray(`${config.timeout}ms`));
      }
      break;

    case 'stdio':
      console.log(chalk.white('Command:'), chalk.blue(config.command));
      if (config.args && config.args.length > 0) {
        console.log(chalk.white('Arguments:'), chalk.gray(config.args.join(' ')));
      }
      if (config.cwd) {
        console.log(chalk.white('Working Directory:'), chalk.gray(config.cwd));
      }
      if (config.env && Object.keys(config.env).length > 0) {
        console.log(chalk.white('Environment:'));
        for (const [key, value] of Object.entries(config.env)) {
          console.log(`  ${chalk.gray(key)}=${chalk.gray(value)}`);
        }
      }
      break;

    case 'stdio-docker':
      console.log(chalk.white('Container Image:'), chalk.blue(config.containerImage));
      if (config.containerEnv && Object.keys(config.containerEnv).length > 0) {
        console.log(chalk.white('Environment:'));
        for (const [key, value] of Object.entries(config.containerEnv)) {
          console.log(`  ${chalk.gray(key)}=${chalk.gray(value)}`);
        }
      }
      if (config.containerMemory) {
        console.log(chalk.white('Memory Limit:'), chalk.gray(`${config.containerMemory}MB`));
      }
      if (config.containerCpu) {
        console.log(chalk.white('CPU Limit:'), chalk.gray(`${config.containerCpu} cores`));
      }
      break;
  }

  if (config.toolPrefix) {
    console.log(chalk.white('Tool Prefix:'), chalk.gray(config.toolPrefix));
  }

  console.log();
}

export function displayTestResult(
  name: string,
  result: {
    success: boolean;
    message: string;
    transport?: string;
    toolCount?: number;
    tools?: string[];
    error?: string;
  }
): void {
  console.log();
  console.log(chalk.bold.cyan(`Testing '${name}'...`));
  console.log(chalk.gray('─'.repeat(50)));

  if (result.success) {
    displaySuccess(result.message);
    if (result.transport) {
      console.log(chalk.white('Transport:'), chalk.blue(result.transport));
    }
    if (result.toolCount !== undefined) {
      console.log(chalk.white('Tools available:'), chalk.green(result.toolCount.toString()));
      if (result.tools && result.tools.length > 0) {
        console.log();
        result.tools.forEach(tool => {
          console.log(chalk.gray('  •'), chalk.white(tool));
        });
      }
    }
  } else {
    displayError(result.message);
    if (result.error) {
      console.log(chalk.red('Error:'), chalk.gray(result.error));
    }
  }

  console.log();
}
