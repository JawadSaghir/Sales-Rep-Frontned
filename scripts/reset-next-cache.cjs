const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
} catch (error) {
  // A stale dev cache should never block the server from starting.
  console.warn('[dev] could not clear .next cache:', error.message);
}
