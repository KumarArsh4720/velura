// backend/php-manager.js - SIMPLIFIED VERSION
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let phpProcess = null;
let isRunning = false;

export class PHPServerManager {
  constructor() {
    this.port = 8000;
    this.host = 'localhost';
    this.configFile = this.detectConfigFile();
  }

  detectConfigFile() {
    const platform = os.platform();
    
    if (platform === 'linux') {
      const configFile = 'php-server-linux.ini';
      if (fs.existsSync(path.join(__dirname, configFile))) {
        return configFile;
      }
    }
    return null;
  }

  async start() {
    if (isRunning) {
      return { success: true, message: 'Already running', pid: phpProcess?.pid };
    }

    try {
      console.log(chalk.cyan(`   • Starting PHP server on port ${this.port}...`));
      
      // Build PHP arguments
      const args = ['-S', `${this.host}:${this.port}`, '-t', __dirname];
      
      // Add config file if it exists
      if (this.configFile) {
        const configPath = path.join(__dirname, this.configFile);
        if (fs.existsSync(configPath)) {
          args.unshift('-c', configPath);
          console.log(chalk.gray(`   • Using config: ${this.configFile}`));
        }
      }
      
      // Start PHP process
      phpProcess = spawn('php', args, {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      // Capture startup message
      phpProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output.includes('Development Server') && output.includes('started')) {
          console.log(chalk.green(`   ✅ ${output}`));
          isRunning = true;
        }
      });

      phpProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        // Only show real errors, not normal access logs
        if (output.includes('Error') || output.includes('Failed')) {
          console.error(chalk.red(`   PHP Error: ${output.substring(0, 100)}`));
        }
      });

      phpProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
          console.error(chalk.red('   • PHP not installed'));
        }
      });

      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (phpProcess && !phpProcess.killed) {
        isRunning = true;
        console.log(chalk.green(`   • PHP server running on http://${this.host}:${this.port}`));
        return { success: true, message: 'Running', pid: phpProcess.pid };
      } else {
        throw new Error('PHP process died');
      }

    } catch (error) {
      console.error(chalk.red(`   • PHP server failed: ${error.message}`));
      return { success: false, message: error.message };
    }
  }

  async isAlive() {
    // Check if our process is running
    if (isRunning && phpProcess && !phpProcess.killed) {
      return true;
    }
    
    // Check if port 8000 is listening
    try {
      const net = await import('net');
      return new Promise((resolve) => {
        const socket = net.createConnection(this.port, this.host, () => {
          socket.end();
          resolve(true);
        });
        
        socket.setTimeout(1000);
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        
        socket.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  stop() {
    if (phpProcess && !phpProcess.killed) {
      console.log(chalk.gray('   • Stopping PHP server...'));
      phpProcess.kill('SIGTERM');
      phpProcess = null;
      isRunning = false;
    }
  }

  getStatus() {
    return {
      running: isRunning,
      port: this.port,
      host: this.host
    };
  }
}

// Singleton instance
export const phpManager = new PHPServerManager();