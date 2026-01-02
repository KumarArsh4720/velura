import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanupOldLogs() {
  const logsDir = path.join(__dirname, 'logs');
  
  if (!fs.existsSync(logsDir)) {
    console.log('No logs directory found');
    return;
  }
  
  const files = fs.readdirSync(logsDir);
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  
  let deletedCount = 0;
  
  files.forEach(file => {
    const filePath = path.join(logsDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.mtimeMs < sevenDaysAgo) {
      fs.unlinkSync(filePath);
      deletedCount++;
      console.log(`Deleted old log: ${file}`);
    }
  });
  
  console.log(`Cleaned up ${deletedCount} old log files`);
}

// Run cleanup
cleanupOldLogs();