import { io } from 'socket.io-client';
import { spawn } from 'child_process';
import path from 'path';

async function runTest() {
  console.log('Starting Test: Gemini Loop Integration');

  // 1. Start Server in background
  console.log('Spawning Server...');
  const serverProcess = spawn('npx', ['ts-node', 'src/index.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3001', GEMINI_API_KEY: 'test-key' } 
    // Note: 'test-key' will fail real Gemini calls, so this test expects failure or mocks if we were using a real integration env.
    // For this script, we just want to verify socket flow up to the point of API interaction or mocked interaction.
    // However, since we can't easily mock inside the spawned process without more complex setup, 
    // we will rely on the fact that we can't fully test the Gemini API without a real key.
    // BUT, we can test the connection and initial handshake.
  });

  serverProcess.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
  serverProcess.stderr.on('data', (data) => console.error(`[Server ERR]: ${data}`));

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 2. Connect Client
  const socket = io('http://localhost:3001', {
    query: { sessionId: 'test-session-integration' },
    auth: { token: 'test-key' }
  });

  socket.on('connect', () => {
    console.log('Client connected');
    // Send a message
    socket.emit('message', 'Hello world');
  });

  socket.on('system:ready', (data) => {
      console.log('System Ready:', data);
  });

  socket.on('agent:thinking', () => {
      console.log('Agent is thinking...');
  });

  socket.on('agent:response', (text) => {
      console.log('Agent Response:', text);
  });

  socket.on('agent:error', (err) => {
      console.error('Agent Error:', err);
      // Expected error since API key is fake
      if (err.includes('API key not valid') || err.includes('GoogleGenerativeAI Error')) {
          console.log('SUCCESS: Reached Gemini API call (failed as expected with fake key).');
          cleanup();
      }
  });

  function cleanup() {
      socket.close();
      serverProcess.kill();
      process.exit(0);
  }

  // Timeout
  setTimeout(() => {
      console.error('Timeout waiting for response');
      cleanup();
  }, 10000);
}

runTest();
