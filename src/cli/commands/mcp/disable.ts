import ora from 'ora';
import { ConfigStore } from '../../../registry/ConfigStore';
import { MCPRegistry } from '../../../registry/MCPRegistry';
import { displaySuccess, displayError } from '../../utils/display';

export async function disableCommand(name: string): Promise<void> {
  const spinner = ora(`Disabling MCP server '${name}'...`).start();

  try {
    const configStore = new ConfigStore();
    const registry = new MCPRegistry(configStore);
    await registry.initialize();

    await registry.disableMCP(name);
    spinner.succeed();

    displaySuccess(`MCP server '${name}' disabled`);
  } catch (error) {
    spinner.fail();
    displayError((error as Error).message);
    process.exit(1);
  }
}
