// backend/scripts/start-php.js - FIXED VERSION
import { phpManager } from '../php-manager.js';
import chalk from 'chalk';

console.log(chalk.cyan('🚀 PHP Server Controller'));

async function main() {
  // Check if PHP is already running
  const isAlive = await phpManager.isAlive();
  
  if (isAlive) {
    console.log(chalk.green('✅ PHP server is already running'));
    console.log(chalk.gray('   • Controller will monitor the server'));
  } else {
    // Start PHP server
    console.log(chalk.yellow('   • Starting PHP server...'));
    const result = await phpManager.start();
    
    if (!result.success) {
      console.error(chalk.red('❌ Failed to start PHP server:'), result.message);
      process.exit(1);
    }
    
    console.log(chalk.green('✅ PHP server started'));
  }
  
  // CRITICAL: Keep this process alive but listen for shutdown signals
  process.stdin.resume();
  
  // Listen for shutdown signals from concurrently
  process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n⚠  Received shutdown signal...'));
    phpManager.stop();
    console.log(chalk.green('✅ PHP server stopped'));
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n⚠  Received Ctrl+C...'));
    phpManager.stop();
    console.log(chalk.green('✅ PHP server stopped'));
    process.exit(0);
  });
  
  // Keep process alive with a simple interval
  setInterval(() => {
    // Just keep alive - do nothing
  }, 60000); // 60 seconds
}

main().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});