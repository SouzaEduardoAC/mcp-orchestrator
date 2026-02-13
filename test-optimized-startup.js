#!/usr/bin/env node

/**
 * Test Phase 3 optimized startup with Node.js tuning
 */

console.log('🧪 Testing Phase 3: Optimized Node.js Startup\n');
console.log('=' .repeat(60));

// Check Node.js version
console.log('\n📦 Node.js Environment:');
console.log(`   Version: ${process.version}`);
console.log(`   Platform: ${process.platform}`);
console.log(`   Arch: ${process.arch}`);

// Check memory configuration
const v8 = require('v8');
const heapStats = v8.getHeapStatistics();

console.log('\n💾 Memory Configuration:');
console.log(`   Heap Size Limit: ${(heapStats.heap_size_limit / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`   Total Heap Size: ${(heapStats.total_heap_size / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Used Heap Size: ${(heapStats.used_heap_size / 1024 / 1024).toFixed(2)} MB`);

// Check if --expose-gc is enabled
console.log('\n🔧 Node.js Flags:');
console.log(`   --expose-gc: ${typeof global.gc === 'function' ? '✅ Enabled' : '❌ Disabled'}`);

// Check NODE_OPTIONS
if (process.env.NODE_OPTIONS) {
  console.log(`   NODE_OPTIONS: ${process.env.NODE_OPTIONS}`);
} else {
  console.log('   NODE_OPTIONS: Not set');
}

// Test manual GC if available
if (typeof global.gc === 'function') {
  console.log('\n🧹 Testing Manual GC:');
  const before = process.memoryUsage().heapUsed;

  // Create some garbage
  let arr = [];
  for (let i = 0; i < 1000000; i++) {
    arr.push({ data: 'test'.repeat(10) });
  }
  arr = null;

  // Run GC
  global.gc();
  const after = process.memoryUsage().heapUsed;

  console.log(`   Heap before GC: ${(before / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Heap after GC: ${(after / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Collected: ${((before - after) / 1024 / 1024).toFixed(2)} MB`);
}

console.log('\n' + '='.repeat(60));
console.log('✅ Optimized startup test complete!\n');

// Expected results when using start-optimized.sh:
// - Heap Size Limit should be ~4GB (not default ~2GB)
// - --expose-gc should be enabled
// - NODE_OPTIONS should show the flags
