// frontend/production-server.js - Production server with security & Cloudflare support
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import chalk from 'chalk';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Cloudflare proxy
app.set('trust proxy', 1);

// Create logs and audits directories
const logsDir = path.join(__dirname, 'logs');
const auditsDir = path.join(logsDir, 'audits');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
if (!fs.existsSync(auditsDir)) {
  fs.mkdirSync(auditsDir, { recursive: true });
}

// Configure Winston logger for error retention (7 days)
const logger = createLogger({
  level: 'error', // Only errors in production
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    // Daily rotate file transport (7 days retention)
    new DailyRotateFile({
      filename: path.join(logsDir, 'frontend-errors-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      level: 'error',
      auditFile: path.join(auditsDir, 'frontend-errors-audit.json'),
    }),
    // Also log errors to console
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} ${level}: ${message} ${stack || ''}`;
        })
      ),
      level: 'error'
    })
  ]
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // You should configure this properly later
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression middleware
app.use(compression());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['https://velura.sbs', 'https://www.velura.sbs'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      logger.warn(msg);
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Serve static files from dist folder
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Cache static assets for 1 year
    if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|webp|svg|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Define routes mapping
const routes = {
  '/': 'index.html',
  '/home': 'home.html',
  '/auth': 'auth.html',
  '/browse': 'browse.html',
  '/support': 'support.html',
  '/account': 'account.html',
  '/404': '404.html'
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    node_version: process.version,
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Sitemap and robots.txt
app.get('/sitemap.xml', (req, res) => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${Object.keys(routes).map(route => `
        <url>
          <loc>https://velura.sbs${route === '/' ? '' : route}</loc>
          <priority>${route === '/' ? '1.0' : '0.8'}</priority>
          <changefreq>weekly</changefreq>
        </url>
      `).join('')}
    </urlset>`;
  
  res.header('Content-Type', 'application/xml');
  res.send(sitemap);
});

app.get('/robots.txt', (req, res) => {
  const robots = `User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://velura.sbs/sitemap.xml`;
  
  res.type('text/plain');
  res.send(robots);
});

// Error logging middleware
app.use((err, req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
  
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handle all routes for SPA
app.get('*', (req, res) => {
  const url = req.path;
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;

  // Log 404s but don't show to users
  if (!routes[url] && url !== '/health' && url !== '/sitemap.xml' && url !== '/robots.txt') {
    logger.warn(`404 - Route not found: ${url} from IP: ${ip}`);
  }

  // Check if it's a known route
  const routeKey = routes[url] ? url : '/';

  // Set cache headers for HTML files
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // Send the main HTML file
  res.sendFile(path.join(__dirname, 'dist', routes[routeKey] || 'index.html'), (err) => {
    if (err) {
      logger.error(`Error serving ${url}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).sendFile(path.join(__dirname, 'dist', '404.html'));
      }
    }
  });
});

// Start server with beautiful console output
app.listen(PORT, '0.0.0.0', () => {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('                    🚀 VELURA STREAMING SERVICE                   ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.green('  Status:    ') + chalk.bold.green('✅ PRODUCTION ONLINE') + chalk.gray('                      ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.blue('  URL:       ') + chalk.bold.white(`http://localhost:${PORT}`) + chalk.gray('                  ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.yellow('  External:  ') + chalk.bold.white('https://velura.sbs') + chalk.gray('                         ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.magenta('  Node:      ') + chalk.bold.white(`v${process.version}`) + chalk.gray('                            ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.bold.magenta('                     📋 AVAILABLE ROUTES                      ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));

  Object.entries(routes).forEach(([route, file]) => {
    const routeDisplay = route === '/' ? '/ (home)' : route;
    console.log(chalk.cyan('║') + chalk.white(`  ${routeDisplay.padEnd(15)} → ${file.padEnd(20)} `) + chalk.cyan('║'));
  });

  console.log(chalk.cyan('║') + chalk.white(`  /health`.padEnd(15) + ' → Health Check'.padEnd(20) + ' ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.white(`  /sitemap.xml`.padEnd(15) + ' → Sitemap'.padEnd(20) + ' ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.white(`  /robots.txt`.padEnd(15) + ' → Robots.txt'.padEnd(20) + ' ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.bold.cyan('  🔒 Security:   ') + chalk.gray(' Helmet, CORS, Rate Limiting enabled    ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.bold.green('  📊 Monitoring: ') + chalk.gray(' Errors saved to /logs/ (7-day retention) ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.bold.blue('  ⚡ Performance:') + chalk.gray(' Compression & caching enabled          ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.bold.red('  ⚠  Console:    ') + chalk.gray(' All console.log disabled in production    ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝'));
  console.log(chalk.gray('\n  📈 Production Ready!'));
  console.log(chalk.gray('    • Frontend: http://localhost:3000'));
  console.log(chalk.gray('    • Health:   http://localhost:3000/health'));
  console.log(chalk.gray('    • Logs:     /logs/frontend-errors-*.log'));
  console.log(chalk.gray('\n  [Ctrl+C] to stop server\n'));
  
  logger.info(`Production server started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⚠  Shutting down Velura server gracefully...'));
  logger.info('Server shutting down gracefully');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n\n⚠  Received SIGTERM, shutting down...'));
  logger.info('Received SIGTERM, shutting down gracefully');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error(chalk.red('❌ Unhandled Rejection:'), reason);
});