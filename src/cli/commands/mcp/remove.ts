import ora from 'ora';
import { ConfigStore } from '../../../registry/ConfigStore';
import { MCPRegistry } from '../../../registry/MCPRegistry';
import { confirmAction } from '../../utils/prompts';
import { displaySuccess, displayError } from '../../utils/display';

export async function removeCommand(
  name: string,
  options?: { yes?: boolean }
): Promise<void> {
  const spinner = ora();

  try {
    const configStore = new ConfigStore();
    const registry = new MCPRegistry(configStore);
    await registry.initialize();

    // Check if exists
    const mcp = await registry.getMCP(name);
    if (!mcp) {
      displayError(`MCP server '${name}' not found`);
      process.exit(1);
    }

    // Confirm removal
    if (!options?.yes) {
      const confirmed = await confirmAction(
        `Are you sure you want to remove '${name}'?`
      );
      if (!confirmed) {
        console.log('Cancelled');
        return;
      }
    }

    spinner.start(`Removing MCP server '${name}'...`);
    await registry.removeMCP(name);
    spinner.succeed();

    displaySuccess(`MCP server '${name}' removed successfully`);
  } catch (error) {
    spinner.fail();
    displayError((error as Error).message);
    process.exit(1);
  }
}
