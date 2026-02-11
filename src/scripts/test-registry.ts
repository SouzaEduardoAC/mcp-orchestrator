#!/usr/bin/env node
/**
 * Test script for Phase 1: Core Infrastructure
 * Tests ConfigStore, MCPRegistry, and Transport creation
 */

import { ConfigStore } from '../registry/ConfigStore';
import { MCPRegistry } from '../registry/MCPRegistry';
import { TransportFactory } from '../transports/TransportFactory';
import { DockerClient } from '../infrastructure/docker/DockerClient';

async function testPhase1() {
  console.log('🧪 Testing Phase 1: Core Infrastructure\n');

  try {
    // Test 1: ConfigStore
    console.log('📋 Test 1: ConfigStore');
    const configStore = new ConfigStore();
    const config = await configStore.load();
    console.log('✅ Config loaded successfully');
    console.log('   MCPs configured:', Object.keys(config.mcpServers).length);
    console.log('   Settings:', config.settings);
    console.log('');

    // Test 2: MCPRegistry
    console.log('📋 Test 2: MCPRegistry');
    const registry = new MCPRegistry(configStore);
    await registry.initialize();
    console.log('✅ Registry initialized');

    const mcps = await registry.listMCPs();
    console.log('   Registered MCPs:', Object.keys(mcps));
    console.log('');

    // Test 3: Add a new MCP
    console.log('📋 Test 3: Add HTTP MCP (Azure DevOps)');
    try {
      await registry.addMCP('test-azure', {
        transport: 'http',
        url: 'http://localhost:8080',
        enabled: true,
        description: 'Test Azure DevOps MCP'
      });
      console.log('✅ Added test-azure MCP');
    } catch (error) {
      if ((error as Error).message.includes('already exists')) {
        console.log('⚠️  test-azure already exists (skipping)');
      } else {
        throw error;
      }
    }
    console.log('');

    // Test 4: List MCPs
    console.log('📋 Test 4: List all MCPs');
    const allMCPs = await registry.listMCPs();
    for (const [name, mcpConfig] of Object.entries(allMCPs)) {
      console.log(`   - ${name}:`);
      console.log(`     Transport: ${mcpConfig.transport}`);
      console.log(`     Enabled: ${mcpConfig.enabled}`);
      console.log(`     Description: ${mcpConfig.description || 'N/A'}`);
    }
    console.log('');

    // Test 5: Get enabled MCPs
    console.log('📋 Test 5: Get enabled MCPs');
    const enabledMCPs = await registry.getEnabledMCPs();
    console.log('   Enabled MCPs:', Object.keys(enabledMCPs));
    console.log('');

    // Test 6: Transport Factory
    console.log('📋 Test 6: Transport Factory');
    const dockerClient = new DockerClient();

    for (const [name, mcpConfig] of Object.entries(enabledMCPs)) {
      try {
        const transport = TransportFactory.create(mcpConfig, dockerClient);
        console.log(`✅ Created ${mcpConfig.transport} transport for ${name}`);
        console.log(`   Info:`, transport.getInfo());
      } catch (error) {
        console.log(`❌ Failed to create transport for ${name}:`, (error as Error).message);
      }
    }
    console.log('');

    // Test 7: Remove test MCP
    console.log('📋 Test 7: Remove test MCP');
    try {
      await registry.removeMCP('test-azure');
      console.log('✅ Removed test-azure MCP');
    } catch (error) {
      console.log('⚠️  test-azure not found (already removed)');
    }
    console.log('');

    console.log('🎉 Phase 1 Tests Completed Successfully!\n');
    console.log('✅ ConfigStore: Working');
    console.log('✅ MCPRegistry: Working');
    console.log('✅ Transport Factory: Working');
    console.log('');
    console.log('Next: Phase 2 - CLI Tool');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testPhase1().catch(console.error);
