import { exec } from 'child_process';

// Function to run a script with child_process
const runScript = (script: string) => {
  return new Promise((resolve, reject) => {
    const process = exec(`ts-node ${script}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing ${script}:`, error);
        reject(error);
      }
      if (stderr) {
        console.error(`Stderr from ${script}:`, stderr);
      }
      console.log(`Stdout from ${script}:`, stdout);
      resolve(stdout);
    });

    process.on('exit', (code) => {
      console.log(`Process ${script} exited with code ${code}`);
    });
  });
};

// Run both scripts in parallel
Promise.all([
  runScript('packages/data/src/processes/chain.ts'),
  runScript('packages/data/src/processes/market.ts')
]).catch(error => {
  console.error('Error running scripts in parallel:', error);
});