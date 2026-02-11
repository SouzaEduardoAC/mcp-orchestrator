#!/usr/bin/env node

import { Command } from 'commander';
import { addCommand } from './commands/mcp/add';
import { listCommand } from './commands/mcp/list';
import { removeCommand } from './commands/mcp/remove';
import { enableCommand } from './commands/mcp/enable';
import { disableCommand } from './commands/mcp/disable';
import { testCommand } from './commands/mcp/test';
import { infoCommand } from './commands/mcp/info';
import { healthCommand } from './commands/mcp/health';

const program = new Command();

program
  .name('llm')
  .description('MCP Orchestrator CLI - Manage MCP servers')
  .version('1.0.0');

// MCP management commands
const mcp = program
  .command('mcp')
  .description('Manage MCP servers');

mcp
  .command('add [name]')
  .description('Add a new MCP server')
  .option('-t, --transport <type>', 'Transport type (http, stdio, sse, stdio-docker)')
  .option('-u, --url <url>', 'URL for HTTP/SSE transport')
  .option('-c, --command <command>', 'Command for stdio transport')
  .option('--args <args>', 'Arguments for stdio transport (comma-separated)')
  .option('-i, --image <image>', 'Docker image for stdio-docker transport')
  .option('-d, --description <desc>', 'Description')
  .option('--header <key=value>', 'Add header (repeatable)', collect, [])
  .action(addCommand);

mcp
  .command('list')
  .description('List all MCP servers')
  .option('--enabled', 'Show only enabled MCPs')
  .option('--format <format>', 'Output format (table, json)', 'table')
  .action(listCommand);

mcp
  .command('remove <name>')
  .description('Remove an MCP server')
  .option('-y, --yes', 'Skip confirmation')
  .action(removeCommand);

mcp
  .command('enable <name>')
  .description('Enable an MCP server')
  .action(enableCommand);

mcp
  .command('disable <name>')
  .description('Disable an MCP server')
  .action(disableCommand);

mcp
  .command('test <name>')
  .description('Test connection to an MCP server')
  .action(testCommand);

mcp
  .command('info <name>')
  .description('Show detailed information about an MCP server')
  .action(infoCommand);

mcp
  .command('health')
  .description('Check health status of all MCP servers')
  .action(healthCommand);

program.parse();

// Helper to collect repeatable options
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
