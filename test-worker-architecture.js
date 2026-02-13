#!/usr/bin/env node

/**
 * Test Phase 3 worker architecture
 * Tests message queue and job processing
 */

const { createClient } = require('redis');

async function testWorkerArchitecture() {
  console.log('🧪 Testing Phase 3: Worker Architecture\n');
  console.log('=' .repeat(60));

  // Connect to Redis
  const client = createClient({ url: 'redis://localhost:6379' });
  await client.connect();

  const queueKey = 'mcp:jobs:queue';

  // Clear existing jobs
  await client.del(queueKey);

  console.log('\n📤 Enqueuing Test Jobs:');

  // Enqueue test jobs
  const jobs = [
    {
      jobId: 'test-job-1',
      sessionId: 'test-session',
      toolName: 'list_files',
      args: { path: '/workspace' },
      callId: 'call-1',
      timestamp: Date.now()
    },
    {
      jobId: 'test-job-2',
      sessionId: 'test-session',
      toolName: 'read_file',
      args: { path: '/workspace/test.txt' },
      callId: 'call-2',
      timestamp: Date.now()
    },
    {
      jobId: 'test-job-3',
      sessionId: 'test-session',
      toolName: 'execute_command',
      args: { command: 'ls -la' },
      callId: 'call-3',
      timestamp: Date.now()
    }
  ];

  for (const job of jobs) {
    await client.lPush(queueKey, JSON.stringify(job));
    console.log(`   ✅ Enqueued: ${job.jobId} (${job.toolName})`);
  }

  // Check queue depth
  const queueDepth = await client.lLen(queueKey);
  console.log(`\n📊 Queue Status:`);
  console.log(`   Queue depth: ${queueDepth} jobs`);
  console.log(`   Queue key: ${queueKey}`);

  // Simulate dequeuing (what a worker would do)
  console.log(`\n📥 Simulating Worker Dequeue:`);

  for (let i = 0; i < 3; i++) {
    const result = await client.brPop(queueKey, 1);
    if (result) {
      const job = JSON.parse(result.element);
      console.log(`   ✅ Dequeued: ${job.jobId} (${job.toolName})`);

      // Simulate publishing result
      const resultChannel = `mcp:results:${job.sessionId}`;
      const jobResult = {
        jobId: job.jobId,
        sessionId: job.sessionId,
        callId: job.callId,
        success: true,
        output: { result: 'Mock result for ' + job.toolName },
        timestamp: Date.now()
      };

      await client.publish(resultChannel, JSON.stringify(jobResult));
      console.log(`   📤 Published result to: ${resultChannel}`);
    }
  }

  // Check final queue depth
  const finalDepth = await client.lLen(queueKey);
  console.log(`\n✅ Final Status:`);
  console.log(`   Queue depth: ${finalDepth} jobs`);
  console.log(`   Jobs processed: ${3 - finalDepth}`);

  // Test pub/sub subscription
  console.log(`\n📡 Testing Pub/Sub:`);

  const subscriber = client.duplicate();
  await subscriber.connect();

  let messageReceived = false;

  await subscriber.subscribe('mcp:results:test-pubsub', (message) => {
    console.log(`   ✅ Received message: ${message.substring(0, 50)}...`);
    messageReceived = true;
  });

  // Give subscription time to be ready
  await new Promise(resolve => setTimeout(resolve, 100));

  // Publish test message
  await client.publish('mcp:results:test-pubsub', JSON.stringify({
    test: 'This is a pub/sub test message'
  }));

  // Wait for message
  await new Promise(resolve => setTimeout(resolve, 200));

  if (messageReceived) {
    console.log(`   ✅ Pub/Sub working correctly`);
  } else {
    console.log(`   ❌ Pub/Sub message not received`);
  }

  // Cleanup
  await subscriber.unsubscribe('mcp:results:test-pubsub');
  await subscriber.quit();
  await client.quit();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Worker architecture test complete!\n');
}

testWorkerArchitecture().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
