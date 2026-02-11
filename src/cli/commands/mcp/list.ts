import ora from 'ora';
import { ConfigStore } from '../../../registry/ConfigStore';
import { MCPRegistry } from '../../../registry/MCPRegistry';
import { displayMCPList, displayError } from '../../utils/display';

export async function listCommand(options?: {
  enabled?: boolean;
  format?: string;
}): Promise<void> {
  const spinner = ora('Loading MCP servers...').start();

  try {
    const configStore = new ConfigStore();
    const registry = new MCPRegistry(configStore);
    await registry.initialize();

    const mcps = options?.enabled
      ? await registry.getEnabledMCPs()
      : await registry.listMCPs();

    spinner.stop();

    if (options?.format === 'json') {
      console.log(JSON.stringify(mcps, null, 2));
    } else {
      displayMCPList(mcps);
    }
  } catch (error) {
    spinner.fail();
    displayError((error as Error).message);
    process.exit(1);
  }
}
