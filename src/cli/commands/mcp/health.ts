import ora from 'ora';
import chalk from 'chalk';
import { ConfigStore } from '../../../registry/ConfigStore';
import { MCPRegistry } from '../../../registry/MCPRegistry';
import { MCPConnectionManager } from '../../../services/MCPConnectionManager';
import { MCPHealthMonitor } from '../../../services/MCPHealthMonitor';
import { DockerClient } from '../../../infrastructure/docker/DockerClient';
import { displayError } from '../../utils/display';

export async function healthCommand(): Promise<void> {
  const spinner = ora('Checking MCP health...').start();

  let connectionManager: MCPConnectionManager | null = null;
  let healthMonitor: MCPHealthMonitor | null = null;

  try {
    const configStore = new ConfigStore();
    const registry = new MCPRegistry(configStore);
    await registry.initialize();

    const dockerClient = new DockerClient();
    connectionManager = new MCPConnectionManager(dockerClient);

    // Initialize connections
    await connectionManager.initialize();

    // Create health monitor and run checks
    healthMonitor = new MCPHealthMonitor(connectionManager, 60000);

    const connectedMCPs = connectionManager.getConnectedMCPs();

    if (connectedMCPs.length === 0) {
      spinner.info();
      console.log(chalk.yellow('\nNo MCPs connected'));
      return;
    }

    // Trigger health checks for all MCPs
    const healthChecks = await Promise.allSettled(
      connectedMCPs.map(name => healthMonitor!.triggerHealthCheck(name))
    );

    spinner.stop();

    // Display results
    console.log();
    console.log(chalk.bold.cyan('MCP Health Status'));
    console.log(chalk.gray('─'.repeat(70)));
    console.log();

    for (let i = 0; i < connectedMCPs.length; i++) {
      const mcpName = connectedMCPs[i];
      const healthCheck = healthChecks[i];

      if (healthCheck.status === 'fulfilled' && healthCheck.value) {
        const health = healthCheck.value;
        const statusIcon = getStatusIcon(health.status);
        const statusColor = getStatusColor(health.status);

        console.log(chalk.bold.white(`${statusIcon} ${mcpName}`));
        console.log(chalk.gray(`  Status: ${statusColor(health.status)}`));
        console.log(chalk.gray(`  Last Check: ${new Date(health.lastCheck).toLocaleString()}`));
        console.log(chalk.gray(`  Last Success: ${new Date(health.lastSuccess).toLocaleString()}`));

        if (health.consecutiveFailures > 0) {
          console.log(chalk.yellow(`  Consecutive Failures: ${health.consecutiveFailures}`));
        }

        if (health.error) {
          console.log(chalk.red(`  Error: ${health.error}`));
        }

        console.log();
      } else {
        console.log(chalk.bold.white(`❌ ${mcpName}`));
        console.log(chalk.red(`  Failed to check health`));
        console.log();
      }
    }

    // Display summary
    const summary = healthMonitor.getHealthSummary();
    console.log(chalk.gray('─'.repeat(70)));
    console.log(chalk.bold.white('Summary'));
    console.log(chalk.white(`  Total: ${summary.total}`));
    console.log(chalk.green(`  Healthy: ${summary.healthy}`));
    if (summary.unhealthy > 0) {
      console.log(chalk.red(`  Unhealthy: ${summary.unhealthy}`));
    }
    if (summary.reconnecting > 0) {
      console.log(chalk.yellow(`  Reconnecting: ${summary.reconnecting}`));
    }
    if (summary.disconnected > 0) {
      console.log(chalk.gray(`  Disconnected: ${summary.disconnected}`));
    }
    console.log();

  } catch (error) {
    spinner.fail();
    displayError((error as Error).message);
    process.exit(1);
  } finally {
    // Cleanup
    if (healthMonitor) {
      healthMonitor.stop();
    }
    if (connectionManager) {
      await connectionManager.cleanup();
    }
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'healthy':
      return '✓';
    case 'unhealthy':
      return '⚠';
    case 'reconnecting':
      return '↻';
    case 'disconnected':
      return '✗';
    default:
      return '?';
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'healthy':
      return chalk.green;
    case 'unhealthy':
      return chalk.red;
    case 'reconnecting':
      return chalk.yellow;
    case 'disconnected':
      return chalk.gray;
    default:
      return chalk.white;
  }
}
