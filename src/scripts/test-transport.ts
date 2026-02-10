import { DockerClient } from '../infrastructure/docker/DockerClient';
import { DockerContainerTransport } from '../infrastructure/transport/DockerContainerTransport';
import { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';

async function main() {
  const docker = new DockerClient();
  const image = 'alpine:latest';
  
  console.log(`Pulling ${image}...`);
  try {
      await docker.pullImage(image);
  } catch (e) {
      console.warn("Pull failed or image already exists, trying to proceed...", e);
  }
  
  console.log('Spawning container...');
  // Use 'cat' to echo input to output
  const container = await docker.spawnContainer(image, {}, ['cat']);
  
  const transport = new DockerContainerTransport(container);
  
  await transport.start();
  
  console.log('Sending message...');
  const message: JSONRPCRequest = { 
      jsonrpc: '2.0', 
      method: 'ping', 
      id: 1, 
      params: { note: 'hello' } 
  };
  
  const timeout = setTimeout(() => {
      console.error('Timeout waiting for response.');
      container.kill().then(() => container.remove()).finally(() => process.exit(1));
  }, 10000);

  transport.onmessage = (msg) => {
    console.log('Received message:', JSON.stringify(msg));
    // Since we use 'cat', we expect the exact same message back.
    if ((msg as any).id === 1 && (msg as any).method === 'ping') {
        console.log('SUCCESS: Transport verification passed.');
        clearTimeout(timeout);
        // Cleanup
        transport.close().catch(console.error);
        container.stop().then(() => container.remove()).then(() => process.exit(0));
    }
  };
  
  await transport.send(message);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
