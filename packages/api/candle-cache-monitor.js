#!/usr/bin/env node

// Candle Cache Process Monitor (Separated IPC Keys)
// Usage: node candle-cache-monitor.js [--interval=2000] [--format=json|table] [--builder=all|builder|rebuilder]

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

// Parse command line arguments
const args = process.argv.slice(2);
const interval = parseInt(args.find(arg => arg.startsWith('--interval='))?.split('=')[1]) || 2000;
const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'table';
const builder = args.find(arg => arg.startsWith('--builder='))?.split('=')[1] || 'all';

let lastStatus = null;
let startTime = Date.now();

async function getStatus() {
  try {
    let endpoint;
    switch (builder) {
      case 'builder':
        endpoint = `${baseUrl}/cache/candle-cache-status/builder`;
        break;
      case 'rebuilder':
        endpoint = `${baseUrl}/cache/candle-cache-status/rebuilder`;
        break;
      case 'all':
      default:
        endpoint = `${baseUrl}/cache/candle-cache-status/all`;
        break;
    }
    
    const response = await fetch(endpoint);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch status:', error.message);
    return null;
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatTableOutput(status) {
  const now = new Date().toLocaleTimeString().slice(0, 8);
  
  if (!status) {
    console.log(`${now} | ERROR    | Failed to fetch status`);
    return;
  }
  
  if (builder === 'all') {
    // Format for all builders
    const builderActive = status.candleCacheBuilder?.isActive;
    const rebuilderActive = status.candleCacheReBuilder?.isActive;
    
    if (!builderActive && !rebuilderActive) {
      console.log(`${now} | IDLE     | Both builders idle`);
      return;
    }
    
    if (builderActive) {
      const processTime = status.candleCacheBuilder.startTime ? formatDuration(Date.now() - status.candleCacheBuilder.startTime) : 'unknown';
      const description = status.candleCacheBuilder.builderStatus?.description || 'Processing...';
      console.log(`${now} | ACTIVE   | Builder              | ${processTime} | ${description}`);
    }
    
    if (rebuilderActive) {
      const processTime = status.candleCacheReBuilder.startTime ? formatDuration(Date.now() - status.candleCacheReBuilder.startTime) : 'unknown';
      const processType = status.candleCacheReBuilder.processType || 'unknown';
      const resource = status.candleCacheReBuilder.resourceSlug ? ` (${status.candleCacheReBuilder.resourceSlug})` : '';
      const description = status.candleCacheReBuilder.builderStatus?.description || 'Processing...';
      console.log(`${now} | ACTIVE   | ReBuilder ${processType}${resource} | ${processTime} | ${description}`);
    }
  } else {
    // Format for single builder
    if (!status.isActive) {
      const builderName = builder === 'builder' ? 'Builder' : 'ReBuilder';
      console.log(`${now} | IDLE     | ${builderName} idle`);
      return;
    }
    
    const processTime = status.startTime ? formatDuration(Date.now() - status.startTime) : 'unknown';
    const builderName = builder === 'builder' ? 'Builder' : 'ReBuilder';
    const processType = status.processType ? ` ${status.processType}` : '';
    const resource = status.resourceSlug ? ` (${status.resourceSlug})` : '';
    const description = status.builderStatus?.description || 'Processing...';
    
    console.log(`${now} | ACTIVE   | ${builderName}${processType}${resource} | ${processTime} | ${description}`);
  }
}

function formatJsonOutput(status) {
  const timestamp = new Date().toISOString().slice(0, 19) + 'Z'; // Fixed length YYYY-MM-DDTHH:mm:ssZ
  console.log(JSON.stringify({ timestamp, builder, ...status }, null, 2));
}

async function monitor() {
  console.log(`🔍 Monitoring candle cache ${builder} every ${interval}ms...`);
  console.log(`📡 API endpoint: ${baseUrl}/refresh-cache/candle-cache-status/${builder === 'all' ? 'all' : builder}`);
  console.log(`📊 Output format: ${format}`);
  console.log('');
  
  if (format === 'table') {
    console.log('Time     | Status   | Process Type        | Duration | Description');
    console.log('---------|----------|---------------------|----------|--------------------------------------------------');
  }
  
  while (true) {
    const status = await getStatus();
    if (format === 'json') {
      formatJsonOutput(status);
    } else {
      formatTableOutput(status);
    }
    
    // Track status changes for individual builders
    if (status && lastStatus && builder !== 'all') {
      if (!lastStatus.isActive && status.isActive) {
        const builderName = builder === 'builder' ? 'Builder' : 'ReBuilder';
        console.log(`🚀 ${builderName} started: ${status.processType || 'processing'}${status.resourceSlug ? ` (${status.resourceSlug})` : ''}`);
      } else if (lastStatus.isActive && !status.isActive) {
        const duration = lastStatus.startTime ? formatDuration(Date.now() - lastStatus.startTime) : 'unknown';
        const builderName = builder === 'builder' ? 'Builder' : 'ReBuilder';
        console.log(`✅ ${builderName} completed in ${duration}`);
      }
    }
    
    lastStatus = status;
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Monitoring stopped');
  process.exit(0);
});

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Candle Cache Process Monitor (Separated IPC Keys)

Usage: node candle-cache-monitor.js [options]

Options:
  --interval=<ms>     Monitor interval in milliseconds (default: 2000)
  --format=<format>   Output format: json or table (default: table)
  --builder=<type>    Builder to monitor: all, builder, rebuilder (default: all)
  --help, -h          Show this help message

Environment Variables:
  API_BASE_URL        Base URL for the API (default: http://localhost:8008)

Examples:
  node candle-cache-monitor.js
  node candle-cache-monitor.js --builder=rebuilder --interval=5000
  node candle-cache-monitor.js --builder=all --format=json
  API_BASE_URL=https://api.example.com node candle-cache-monitor.js --builder=builder
`);
  process.exit(0);
}

// Start monitoring
monitor().catch(error => {
  console.error('Monitor failed:', error);
  process.exit(1);
}); 