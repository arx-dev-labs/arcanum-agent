// CLI Entry Point

import { run } from './App';

async function main() {
  try {
    await run();
  } catch (error) {
    console.error('Failed to start Arcanum:', error);
    process.exit(1);
  }
}

main();