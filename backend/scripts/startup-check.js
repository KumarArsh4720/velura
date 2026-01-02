// backend/scripts/startup-check.js - Beautiful startup display with system checks
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import mongoose from 'mongoose';

// Import PHP Manager
import { phpManager } from '../php-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '.env') });

class StartupChecker {
  constructor() {
    this.checks = [];
    this.results = [];
  }

  displayHeader() {
    console.clear();
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('               🚀 VELURA BACKEND STARTUP CHECK               ') + chalk.cyan('║'));
    console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + chalk.green('  Server:     ') + chalk.white('Backend System Check') + chalk.gray('                  ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.blue('  Environment: ') + chalk.white(process.env.NODE_ENV || 'development') + chalk.gray('            ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.yellow('  Port:       ') + chalk.white(process.env.PORT || 5000) + chalk.gray('                        ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝\n'));
  }

  addCheck(name, checkFunction) {
    this.checks.push({ name, checkFunction });
  }

  async runChecks() {
    console.log(chalk.cyan('🔍 Running system checks...\n'));
    
    for (const check of this.checks) {
      process.stdout.write(chalk.cyan('   • ') + chalk.white(`${check.name.padEnd(35)}`));
      
      try {
        const result = await check.checkFunction();
        this.results.push({ name: check.name, success: true, message: result });
        console.log(chalk.green('✅ PASS'));
      } catch (error) {
        this.results.push({ name: check.name, success: false, message: error.message });
        console.log(chalk.red('❌ FAIL'));
        console.log(chalk.gray(`      ${error.message}`));
      }
    }
  }

  displayResults() {
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    const allPassed = passed === total;

    console.log(chalk.cyan('\n📊 Check Summary:'));
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    if (allPassed) {
      console.log(chalk.green(`   ✅ ${passed}/${total} checks passed - System Ready!`));
    } else {
      console.log(chalk.yellow(`   ⚠️  ${passed}/${total} checks passed - Review failed checks`));
    }

    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }

  displayNextSteps() {
    console.log(chalk.cyan('🚀 Next Steps:'));
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    
    const failedChecks = this.results.filter(r => !r.success);
    
    if (failedChecks.length > 0) {
      console.log(chalk.yellow('⚠️  Address these issues first:'));
      failedChecks.forEach(check => {
        console.log(`   • ${chalk.white(check.name)}: ${chalk.red(check.message)}`);
      });
      console.log('');
    }

    console.log(chalk.white('1.') + ' Start both servers:      ' + chalk.cyan('npm start'));
    console.log(chalk.white('2.') + ' Start PHP only:          ' + chalk.cyan('npm run start:php'));
    console.log(chalk.white('3.') + ' Start Express only:      ' + chalk.cyan('node server.js'));
    console.log(chalk.white('4.') + ' Test email system:       ' + chalk.cyan('npm run email:test'));
    console.log(chalk.white('5.') + ' View logs:               ' + chalk.cyan('npm run logs'));
    console.log(chalk.white('6.') + ' Check server health:     ' + chalk.cyan('curl http://localhost:5000/health'));
    console.log(chalk.white('7.') + ' Check PHP server:        ' + chalk.cyan('curl -I http://localhost:8000/'));
    console.log(chalk.white('8.') + ' Monitor errors:          ' + chalk.cyan('npm run monitor'));
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }
}

// Define checks
async function checkEnvironmentVars() {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'TMDB_API_KEY'];
  const optionalButImportant = ['EMAIL_USER', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CLIENT_URL'];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(', ')}`);
  }
  
  const missingOptional = optionalButImportant.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    return `Optional missing: ${missingOptional.join(', ')}`;
  }
  
  return 'All variables present';
}

async function checkMongoDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not set');
  }
  
  try {
    // Quick connection test without worrying about IP whitelist issues
    const uri = process.env.MONGODB_URI;
    
    // Basic validation of MongoDB URI format
    if (!uri.startsWith('mongodb+srv://') && !uri.startsWith('mongodb://')) {
      throw new Error('Invalid MongoDB URI format');
    }
    
    // Try a quick connection with short timeout
    await mongoose.connect(uri, { 
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 2000
    });
    
    // Test if we can perform a simple operation
    const adminDb = mongoose.connection.db.admin();
    const serverStatus = await adminDb.ping();
    
    if (serverStatus.ok === 1) {
      await mongoose.connection.close();
      return 'Connected successfully';
    } else {
      throw new Error('Connection test failed');
    }
  } catch (error) {
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('timeout') || 
        errorMsg.includes('whitelist') || 
        errorMsg.includes('enetunreach') ||
        errorMsg.includes('econnrefused')) {
      return 'Connection test failed (IP may need whitelisting)';
    }
    
    throw new Error(`Connection failed: ${error.message}`);
  }
}

async function checkEmailConfig() {
  if (!process.env.EMAIL_USER) {
    return 'Email not configured (optional)';
  }
  
  const hasClientId = process.env.GOOGLE_CLIENT_ID;
  const hasClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const hasRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
  
  if (!hasClientId || !hasClientSecret) {
    return 'Email setup incomplete - missing OAuth credentials';
  }
  
  if (!hasRefreshToken) {
    return 'Email setup required - run: npm run email:setup';
  }
  
  return 'Email configured (ready for setup/test)';
}

async function checkStoragePaths() {
  const paths = [
    path.join(__dirname, '..', 'temp-downloads'),
    path.join(__dirname, '..', 'temp-trailers'),
    path.join(__dirname, '..', 'logs')
  ];
  
  for (const p of paths) {
    try {
      const fs = await import('fs');
      await fs.promises.access(p, fs.constants.W_OK);
    } catch {
      try {
        const fs = await import('fs');
        await fs.promises.mkdir(p, { recursive: true });
      } catch (mkdirError) {
        throw new Error(`Cannot create/write to ${path.basename(p)}`);
      }
    }
  }
  
  return 'All storage paths accessible';
}

async function checkExternalHDD() {
  if (!process.env.EXTERNAL_HDD_PATH) {
    return 'External HDD not configured (optional)';
  }
  
  try {
    const fs = await import('fs');
    await fs.promises.access(process.env.EXTERNAL_HDD_PATH, fs.constants.R_OK);
    return 'External HDD accessible';
  } catch {
    return 'External HDR not accessible (check path)';
  }
}

async function checkTMDBAPI() {
  if (!process.env.TMDB_API_KEY) {
    return 'TMDB API key not set';
  }
  
  const WORKER_URL = "https://tmdb-worker.kumararsh4720.workers.dev";
  try {
    const { default: fetch } = await import('node-fetch');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`${WORKER_URL}/movie/550`, { 
      signal: controller.signal 
    });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      return `Worker online (${data.title})`;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (error) {
    return `Worker check failed: ${error.message}`;
  }
}

async function checkPHPServer() {
  try {
    // Check if PHP is installed
    const { exec } = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(exec);
    
    try {
      const { stdout } = await execPromise('php --version');
      const version = stdout.split('\n')[0];
      return `PHP ${version.split(' ')[1]} installed`;
    } catch {
      throw new Error('PHP not found in PATH');
    }
  } catch (error) {
    throw new Error(`PHP check failed: ${error.message}`);
  }
}

// Main execution
async function main() {
  const checker = new StartupChecker();
  checker.displayHeader();

  // Add all checks
  checker.addCheck('Environment Variables', checkEnvironmentVars);
  checker.addCheck('MongoDB Connection', checkMongoDB);
  checker.addCheck('Email Configuration', checkEmailConfig);
  checker.addCheck('Storage Paths', checkStoragePaths);
  checker.addCheck('External HDD', checkExternalHDD);
  checker.addCheck('TMDB API Worker', checkTMDBAPI);
  checker.addCheck('PHP Installation', checkPHPServer);

  // Run checks
  await checker.runChecks();
  
  // Display results
  checker.displayResults();
  
  // Show next steps
  checker.displayNextSteps();
  
  // Exit with appropriate code
  const allPassed = checker.results.every(r => r.success);
  process.exit(allPassed ? 0 : 1);
}

// Handle errors
main().catch(error => {
  console.error(chalk.red('\n❌ Startup check failed:'), error.message);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⚠  Startup check interrupted'));
  process.exit(0);
});