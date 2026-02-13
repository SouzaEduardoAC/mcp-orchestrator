#!/usr/bin/env node

/**
 * Test Phase 3 conversation compression
 */

const { createClient } = require('redis');
const { gzipSync, gunzipSync } = require('zlib');

async function testCompression() {
  console.log('🧪 Testing Phase 3: Conversation Compression\n');
  console.log('=' .repeat(60));

  // Connect to Redis
  const client = createClient({ url: 'redis://localhost:6379' });
  await client.connect();

  const testSessionId = 'test-compression-session';
  const key = `mcp:conversation:${testSessionId}`;

  // Clear any existing data
  await client.del(key);

  // Test data
  const testMessage = {
    role: 'user',
    content: 'This is a test message to verify compression works correctly. '.repeat(10),
    timestamp: Date.now()
  };

  const serialized = JSON.stringify(testMessage);
  const compressed = gzipSync(Buffer.from(serialized, 'utf-8'));

  console.log('\n📊 Compression Test:');
  console.log(`   Original size: ${serialized.length} bytes`);
  console.log(`   Compressed size: ${compressed.length} bytes`);
  console.log(`   Reduction: ${((1 - compressed.length / serialized.length) * 100).toFixed(1)}%`);

  // Store compressed data (convert buffer to base64 for Redis)
  await client.rPush(key, compressed.toString('base64'));

  // Read back and decompress
  const raw = await client.lRange(key, 0, -1);
  const compressedBuffer = Buffer.from(raw[0], 'base64');
  const decompressed = gunzipSync(compressedBuffer).toString('utf-8');
  const recovered = JSON.parse(decompressed);

  console.log('\n✅ Verification:');
  console.log(`   Original: "${testMessage.content.substring(0, 50)}..."`);
  console.log(`   Recovered: "${recovered.content.substring(0, 50)}..."`);
  console.log(`   Match: ${testMessage.content === recovered.content ? '✅ Yes' : '❌ No'}`);

  // Check actual Redis memory usage
  const info = await client.info('memory');
  const usedMemory = info.match(/used_memory_human:([^\r\n]+)/)?.[1];
  console.log(`\n📈 Redis Memory: ${usedMemory}`);

  // Cleanup
  await client.del(key);
  await client.quit();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Compression test complete!\n');
}

testCompression().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
