// server.js - SILENT VERSION (errors only in console) - WITH PHP INTEGRATION
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

// Import your existing logger - ONLY ONCE!
import { enhancedLogger as logger } from './utils/logger.js';

// Import PHP Manager
import { phpManager } from './php-manager.js';

// Import required modules
import express from "express";
import mongoose from 'mongoose';
import cors from "cors";
import tmdbRoutes from "./routes/tmdbRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { initializeEmailSystem } from './utils/sendEmail.js';
import localTrailerRoutes from './routes/localTrailerRoutes.js';
import storageManager from './services/storageManager.js';

const app = express();
const PORT = process.env.PORT || 5000;

// 🔥 SECURITY: Only allow requests from frontend or internal
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  /\.ngrok-free\.dev$/,
  process.env.CLIENT_URL ? new URL(process.env.CLIENT_URL).origin : null
].filter(Boolean);

// Custom CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow health checks and internal requests
  if (req.path === '/health' || req.path === '/health-check') {
    return next();
  }

  // Check if origin is allowed
  if (origin) {
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (!isAllowed) {
      logger.warn(`Blocked CORS: ${origin} for ${req.method} ${req.path}`);
      return res.status(403).json({
        error: 'CORS not allowed',
        message: 'Please use the frontend interface'
      });
    }

    // Set CORS headers
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());

// Fix for rate limit warning - trust proxy
app.set('trust proxy', 1);

// Routes
app.use("/api/tmdb", tmdbRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/local-trailer", localTrailerRoutes);

// Health endpoint (public)
app.get('/health', (req, res) => {
  res.json({
    status: '✅ Running',
    server: 'Velura Backend',
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: 'MongoDB',
      storage: storageManager.getStoragePath() ? 'Configured' : 'Not configured',
      email: process.env.EMAIL_USER ? 'Configured' : 'Not configured',
      php: phpManager.isAlive() ? '✅ Running' : '❌ Stopped'
    }
  });
});

// PHP server status endpoint
app.get('/health/php', (req, res) => {
  const status = phpManager.getStatus();
  res.json({
    running: status.running,
    port: status.port,
    host: status.host,
    uptime: status.running ? 'N/A' : 'Not running'
  });
});

// Health check for internal use
app.get('/health-check', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Block all other direct access
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/health-check' || req.path === '/health/php') {
    return next();
  }

  logger.warn(`Blocked direct access: ${req.method} ${req.path} from ${req.ip}`);
  return res.status(403).json({
    error: 'Direct access not allowed',
    message: 'Please use the frontend application'
  });
});

// Frontend error logging endpoint
app.post('/api/log-error', async (req, res) => {
  try {
    const errorData = req.body;
    
    // Log to your existing logger (which has 7-day retention)
    logger.error('Frontend Error:', errorData);
    
    res.json({ success: true, message: 'Error logged' });
  } catch (error) {
    logger.error('Failed to log frontend error:', error);
    res.status(500).json({ success: false, message: 'Failed to log error' });
  }
});

// MongoDB connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not found in environment variables');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    return { success: true, message: '✅ Connected' };
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    return { success: false, message: `❌ ${error.message}` };
  }
};

// TMDB status check function (SILENT)
async function checkTMDBStatus() {
  const WORKER_URL = "https://tmdb-worker.kumararsh4720.workers.dev";
  
  // Check if we can import fetch
  let fetch;
  try {
    fetch = (await import('node-fetch')).default;
  } catch (e) {
    return { 
      status: '⚠️ UNKNOWN', 
      message: 'Check skipped' 
    };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(`${WORKER_URL}/configuration`, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Velura-Backend/1.0' }
    });
    clearTimeout(timeout);
    
    if (res.ok) {
      return { 
        status: '✅ WORKING', 
        message: 'Cloudflare Worker' 
      };
    } else {
      logger.error(`TMDB Worker returned HTTP ${res.status}`);
      return { 
        status: '❌ OFFLINE', 
        message: `HTTP ${res.status}` 
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.error('TMDB Worker timeout (10s)');
      return { 
        status: '⚠️ SLOW', 
        message: 'Timeout' 
      };
    } else {
      logger.error(`TMDB Worker error: ${err.message}`);
      return { 
        status: '❌ ERROR', 
        message: err.message 
      };
    }
  }
}

// Check email configuration
async function checkEmailConfig() {
  try {
    if (!process.env.EMAIL_USER || !process.env.GMAIL_REFRESH_TOKEN) {
      return { ready: false, message: '⚠️ Setup Required' };
    }
    
    const emailReady = await initializeEmailSystem();
    if (emailReady) {
      return { 
        ready: true, 
        message: '✅ Ready',
        email: process.env.EMAIL_USER 
      };
    } else {
      return { 
        ready: false, 
        message: '⚠️ Setup Required',
        email: process.env.EMAIL_USER 
      };
    }
  } catch (error) {
    logger.error(`Email check error: ${error.message}`);
    return { 
      ready: false, 
      message: '❌ Error',
      error: error.message 
    };
  }
}

// Start cleanup scheduler after storage is initialized
function startCleanupScheduler() {
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const deleted = await storageManager.cleanup();
      if (deleted > 0) {
        logger.info(`Scheduled cleanup removed ${deleted} videos`);
      }
    } catch (error) {
      logger.error(`Scheduled cleanup failed: ${error.message}`);
    }
  }, CLEANUP_INTERVAL);
}

// Beautiful console display function - UPDATED WITH PHP
function displayServerStatus(dbStatus, emailStatus, tmdbStatus, storagePath, allowedOriginsCount, phpRunning) {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('                 🎬 VELURA BACKEND SERVER                   ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.green('  Status:     ') + chalk.bold.green('✅ OPERATIONAL') + chalk.gray('                              ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.blue('  Port:       ') + chalk.bold.white(`http://localhost:${PORT}`) + chalk.gray('                  ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.yellow('  Environment: ') + chalk.bold.white(process.env.NODE_ENV || 'development').padEnd(30) + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.bold.magenta('                    📊 SERVICE STATUS                      ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  
  // Database status
  console.log(chalk.cyan('║') + chalk.white(`  Database:   `.padEnd(15) + 
    (dbStatus.success ? chalk.green(dbStatus.message) : chalk.red(dbStatus.message)).padEnd(30) + 
    chalk.cyan('║')));
  
  // Email status
  const emailDisplay = emailStatus.ready ? 
    chalk.green(`${emailStatus.message} (${emailStatus.email})`) : 
    chalk.yellow(emailStatus.message);
  console.log(chalk.cyan('║') + chalk.white(`  Email:      `.padEnd(15) + emailDisplay.padEnd(30) + chalk.cyan('║')));
  
  // TMDB status
  const tmdbDisplay = tmdbStatus.status === '✅ WORKING' ? 
    chalk.green(tmdbStatus.message) : 
    chalk.red(tmdbStatus.message);
  console.log(chalk.cyan('║') + chalk.white(`  TMDB API:   `.padEnd(15) + tmdbDisplay.padEnd(30) + chalk.cyan('║')));
  
  // PHP Server status
  const phpDisplay = phpRunning ? 
    chalk.green('✅ Running (8000)') : 
    chalk.red('❌ Stopped');
  console.log(chalk.cyan('║') + chalk.white(`  PHP Server: `.padEnd(15) + phpDisplay.padEnd(30) + chalk.cyan('║')));
  
  // Storage status
  const storageDisplay = storagePath ? 
    chalk.green('✅ Configured') : 
    chalk.red('❌ Not Configured');
  console.log(chalk.cyan('║') + chalk.white(`  Storage:    `.padEnd(15) + storageDisplay.padEnd(30) + chalk.cyan('║')));
  
  // Cleanup status
  console.log(chalk.cyan('║') + chalk.white(`  Cleanup:    `.padEnd(15) + chalk.green('✅ Scheduled').padEnd(30) + chalk.cyan('║')));
  
  // CORS status
  console.log(chalk.cyan('║') + chalk.white(`  CORS:       `.padEnd(15) + chalk.green(`✅ ${allowedOriginsCount} origins`).padEnd(30) + chalk.cyan('║')));
  
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.bold.cyan('  📡 Endpoints:') + chalk.gray('                                          ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray('    • /api/tmdb/          - TMDB Proxy API').padEnd(55) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray('    • /api/auth/          - Authentication').padEnd(55) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray('    • /api/local-trailer/ - Local Trailers').padEnd(55) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray('    • /health             - Health Check').padEnd(55) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray('    • /health/php         - PHP Server Status').padEnd(55) + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.bold.red('  ⚠  Logging:   ') + chalk.gray(' Errors saved to /logs/ (7-day retention) ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.bold.yellow('  🔧 Commands:  ') + chalk.gray(' npm run email:setup  npm run email:test ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝'));
  
  // Additional info
  console.log(chalk.gray('\n  📝 Additional Info:'));
  if (storagePath) {
    console.log(chalk.gray(`    • Storage: ${storagePath}`));
  }
  if (!emailStatus.ready) {
    console.log(chalk.yellow('\n  ⚠  Email setup required: npm run email:setup'));
  }
  
  console.log(chalk.gray('\n  [Ctrl+C] to stop both servers\n'));
}

// --- Start server ---
const startServer = async () => {
  try {
    // Optional: Small delay for better visual transition from startup-check UI
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(chalk.cyan('\n🔧 Starting Velura Backend...'));
    
    // 1. Check PHP server status and start if needed
    const phpAlive = await phpManager.isAlive();
    if (!phpAlive) {
      console.log(chalk.yellow('   • Starting PHP server...'));
      const phpResult = await phpManager.start();
      if (phpResult.success) {
        console.log(chalk.green('   ✅ PHP server started on port 8000'));
      } else {
        console.log(chalk.yellow('   ⚠  PHP server failed to start'));
        console.log(chalk.gray(`      ${phpResult.message}`));
        console.log(chalk.gray('      Server will continue without PHP support'));
      }
    } else {
      console.log(chalk.green('   ✅ PHP server is already running'));
    }
    
    // 2. Connect to database
    console.log(chalk.yellow('   • Connecting to MongoDB...'));
    const dbStatus = await connectDB();
    if (dbStatus.success) {
      console.log(chalk.green('   ✅ Database connected'));
    } else {
      console.log(chalk.red(`   ❌ Database connection failed: ${dbStatus.message}`));
    }
    
    // 3. Initialize storage manager
    console.log(chalk.yellow('   • Initializing storage...'));
    await storageManager.init();
    const storagePath = storageManager.getStoragePath();
    console.log(chalk.green(`   ✅ Storage initialized at: ${storagePath || 'Not configured'}`));
    
    // 4. Check email configuration
    console.log(chalk.yellow('   • Checking email system...'));
    const emailStatus = await checkEmailConfig();
    if (emailStatus.ready) {
      console.log(chalk.green(`   ✅ Email system ready (${emailStatus.email})`));
    } else {
      console.log(chalk.yellow(`   ⚠  Email system: ${emailStatus.message}`));
    }
    
    // 5. Check TMDB status
    console.log(chalk.yellow('   • Checking TMDB API...'));
    const tmdbStatus = await checkTMDBStatus();
    console.log(tmdbStatus.status === '✅ WORKING' ?
      chalk.green(`   ✅ ${tmdbStatus.message}`) :
      chalk.red(`   ❌ ${tmdbStatus.message}`)
    );
    
    // 6. Count allowed origins
    const allowedOriginsCount = allowedOrigins.length;
    
    // 7. Start the server
    app.listen(PORT, () => {
      // Get current PHP status for display
      const currentPhpStatus = phpManager.isAlive();
      
      // Display beautiful status panel
      displayServerStatus(dbStatus, emailStatus, tmdbStatus, storagePath, allowedOriginsCount, currentPhpStatus);
      
      // Start cleanup scheduler
      startCleanupScheduler();
      console.log(chalk.gray('   • Cleanup scheduler started (every 6 hours)'));
    });
    
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`, { stack: error.stack });
    console.log(chalk.red(`\n❌ Failed to start server: ${error.message}`));
    process.exit(1);
  }
};

// Start everything
startServer();

// Handle graceful shutdown - PHP STOPS WITH EXPRESS
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⚠  Shutting down Velura Backend gracefully...'));
  
  // 1. Stop PHP server first
  phpManager.stop();
  console.log(chalk.green('   ✅ PHP server stopped'));
  
  // 2. Then close MongoDB
  mongoose.connection.close(false).then(() => {
    console.log(chalk.green('   ✅ MongoDB connection closed'));
    console.log(chalk.green('\n✅ All servers stopped successfully'));
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠  Received SIGTERM signal...'));
  phpManager.stop();
  console.log(chalk.green('   ✅ PHP server stopped'));
  process.exit(0);
});

process.on('exit', (code) => {
  if (code !== 0) {
    phpManager.stop();
  }
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  phpManager.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
  console.error(chalk.red('❌ Unhandled Rejection:'), reason);
});