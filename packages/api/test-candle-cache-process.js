// Simple test script for candle cache process manager with separated IPC keys
// Run with: node test-candle-cache-process.js

const baseUrl = process.env.API_BASE_URL || 'http://localhost:8008';

async function testCandleCacheProcess() {
  console.log('Testing Candle Cache Process Manager (Separated IPC Keys)...\n');
  
  try {
    // Test 1: Check initial status for all builders
    console.log('1. Checking initial status for all builders...');
    const allStatusResponse = await fetch(`${baseUrl}/refresh-cache/candle-cache-status/all`);
    const allStatus = await allStatusResponse.json();
    console.log('All builders status:', JSON.stringify(allStatus, null, 2));
    
    // Test 2: Check individual builder statuses
    console.log('\n2. Checking individual builder statuses...');
    
    const builderStatusResponse = await fetch(`${baseUrl}/refresh-cache/candle-cache-status/builder`);
    const builderStatus = await builderStatusResponse.json();
    console.log('CandleCacheBuilder status:', JSON.stringify(builderStatus, null, 2));
    
    const rebuilderStatusResponse = await fetch(`${baseUrl}/refresh-cache/candle-cache-status/rebuilder`);
    const rebuilderStatus = await rebuilderStatusResponse.json();
    console.log('CandleCacheReBuilder status:', JSON.stringify(rebuilderStatus, null, 2));
    
    // Test 3: Check backward compatibility endpoint
    console.log('\n3. Checking backward compatibility endpoint...');
    const compatStatusResponse = await fetch(`${baseUrl}/refresh-cache/candle-cache-status`);
    const compatStatus = await compatStatusResponse.json();
    console.log('Backward compatibility status (should match rebuilder):', JSON.stringify(compatStatus, null, 2));
    
    if (rebuilderStatus.isActive) {
      console.log('ReBuilder process is already active. Waiting for it to complete...\n');
      await waitForProcessCompletion();
    }
    
    // Test 4: Start rebuild all candles
    console.log('4. Starting rebuild all candles...');
    const rebuildResponse = await fetch(`${baseUrl}/refresh-cache/refresh-candle-cache`);
    const rebuildResult = await rebuildResponse.json();
    console.log('Rebuild result:', JSON.stringify(rebuildResult, null, 2));
    
    if (rebuildResult.success) {
      // Test 5: Check status while process is running
      console.log('\n5. Checking all statuses while process is running...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const runningAllStatusResponse = await fetch(`${baseUrl}/refresh-cache/candle-cache-status/all`);
      const runningAllStatus = await runningAllStatusResponse.json();
      console.log('All builders status (while running):', JSON.stringify(runningAllStatus, null, 2));
      
      // Test 6: Try to start another process (should fail)
      console.log('\n6. Trying to start another process (should fail)...');
      const conflictResponse = await fetch(`${baseUrl}/refresh-cache/refresh-candle-cache`);
      const conflictResult = await conflictResponse.json();
      console.log('Conflict result:', JSON.stringify(conflictResult, null, 2));
      
      // Test 7: Monitor progress for a few cycles
      console.log('\n7. Monitoring progress for 30 seconds...');
      await monitorProgress(30000);
    }
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

async function waitForProcessCompletion() {
  const maxWaitTime = 300000; // 5 minutes
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const statusResponse = await fetch(`${baseUrl}/refresh-cache/candle-cache-status/rebuilder`);
    const status = await statusResponse.json();
    
    if (!status.isActive) {
      console.log('Process completed!');
      return;
    }
    
    console.log(`Process still active: ${status.builderStatus?.description || 'Processing...'}`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  }
  
  console.log('Timed out waiting for process to complete');
}

async function monitorProgress(duration) {
  const endTime = Date.now() + duration;
  let lastDescription = '';
  
  while (Date.now() < endTime) {
    try {
      const statusResponse = await fetch(`${baseUrl}/refresh-cache/candle-cache-status/rebuilder`);
      const status = await statusResponse.json();
      
      if (!status.isActive) {
        console.log('Process completed during monitoring!');
        break;
      }
      
      const currentDescription = status.builderStatus?.description || 'Processing...';
      if (currentDescription !== lastDescription) {
        const elapsed = Math.floor((Date.now() - status.startTime) / 1000);
        console.log(`[${elapsed}s] ReBuilder: ${currentDescription}`);
        lastDescription = currentDescription;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
    } catch (error) {
      console.error('Error during monitoring:', error);
      break;
    }
  }
}

// Run the test
testCandleCacheProcess(); 