const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createHash } = require('crypto');
const { performance } = require('perf_hooks');

// Test file configuration
const TEST_FILE_PATH = './testfile.bin'; // Create this first
const FILE_SIZE_MB = 100; // Size of test file in MB
const WARMUP_RUNS = 3;
const BENCHMARK_RUNS = 10;

// Create test file if it doesn't exist
function createTestFile() {
  if (!fs.existsSync(TEST_FILE_PATH)) {
    console.log(`Creating ${FILE_SIZE_MB}MB test file...`);
    const buffer = Buffer.alloc(1024 * 1024 * FILE_SIZE_MB);
    fs.writeFileSync(TEST_FILE_PATH, buffer);
    console.log('Test file created');
  }
}

// Method 1: Using sha1sum command
function sha1sumCommand(filePath) {
  const output = execSync(`sha1sum "${filePath}"`, { encoding: 'utf-8' });
  return output.trim().split(/\s+/)[0];
}

// Method 2: Using Node.js crypto
function nodeCryptoHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return createHash('sha1').update(fileBuffer).digest('hex');
}

// Benchmark function
function benchmark(method, methodName, filePath, runs) {
  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    method(filePath);
  }

  // Actual benchmark
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    method(filePath);
    const end = performance.now();
    times.push(end - start);
  }

  // Calculate stats
  const avg = times.reduce((a, b) => a + b, 0) / runs;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  console.log(`\n${methodName} Results:`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Minimum: ${min.toFixed(2)}ms`);
  console.log(`  Maximum: ${max.toFixed(2)}ms`);
  console.log(`  All times: ${times.map(t => t.toFixed(2)).join(', ')}ms`);
  
  return { avg, min, max, times };
}

// Main function
async function main() {
  createTestFile();
  const fileSizeBytes = fs.statSync(TEST_FILE_PATH).size;
  const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  
  console.log(`\nBenchmarking SHA1 calculation for ${fileSizeMB}MB file`);
  console.log(`Warmup runs: ${WARMUP_RUNS}, Benchmark runs: ${BENCHMARK_RUNS}`);

  // Benchmark both methods
  const commandResults = benchmark(sha1sumCommand, 'sha1sum Command', TEST_FILE_PATH, BENCHMARK_RUNS);
  const cryptoResults = benchmark(nodeCryptoHash, 'Node.js createHash', TEST_FILE_PATH, BENCHMARK_RUNS);

  // Calculate comparison
  const difference = cryptoResults.avg - commandResults.avg;
  const percentDiff = (difference / commandResults.avg * 100).toFixed(2);
  
  console.log('\nComparison:');
  if (difference > 0) {
    console.log(`  sha1sum is ${percentDiff}% faster than createHash`);
  } else {
    console.log(`  createHash is ${Math.abs(percentDiff)}% faster than sha1sum`);
  }
}

main();