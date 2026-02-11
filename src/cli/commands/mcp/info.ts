import ora from 'ora';
import { ConfigStore } from '../../../registry/ConfigStore';
import { MCPRegistry } from '../../../registry/MCPRegistry';
import { displayMCPInfo, displayError } from '../../utils/display';

export async function infoCommand(name: string): Promise<void> {
  const spinner = ora('Loading MCP information...').start();

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

    spinner.stop();
    displayMCPInfo(name, config);
  } catch (error) {
    spinner.fail();
    displayError((error as Error).message);
    process.exit(1);
  }
}
