import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Color formatter for console (ERRORS ONLY)
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, stack, ...meta }) => {
    // Only show error level messages
    if (level !== 'error') {
      return ''; // Return empty string for non-errors (won't show in console)
    }

    let log = `${timestamp} ${level}: ${message}`;

    if (stack) {
      log += `\n${stack}`;
    }

    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// File format (JSON for easier parsing)
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.json()
);

// Create the logger - ONLY SHOW ERRORS IN CONSOLE
const logger = createLogger({
  level: 'error', // Changed from 'info' to 'error' - only errors will show in console
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    // Console transport - ERRORS ONLY
    new transports.Console({
      format: consoleFormat,
      level: 'error' // Only errors will appear in console
    }),

    // Daily rotate file for errors (7 days retention)
    new DailyRotateFile({
      filename: path.join(logsDir, 'errors-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      format: fileFormat,
      level: 'error', // Only errors in error log
      auditFile: path.join(logsDir, 'audits', 'errors-audit.json')
    }),

    // Daily rotate file for all logs (includes info, warn, error)
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      format: fileFormat,
      level: 'info', // All levels in combined log
      auditFile: path.join(logsDir, 'audits', 'combined-audit.json')
    })
  ],

  // Handle exceptions
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      format: fileFormat,
      auditFile: path.join(logsDir, 'audits', 'exceptions-audit.json')
    }),
    new transports.Console({
      format: consoleFormat
    })
  ],

  exitOnError: false
});

// Custom logging methods - Only log errors to console
const logWithRequest = (level, message, req = null) => {
  const logData = { message };

  if (req) {
    logData.request = {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    if (req.user) {
      logData.user = {
        id: req.user.id,
        email: req.user.email
      };
    }
  }

  logger[level](logData);
};

// Export enhanced logger - Forced to error level only for console
export const enhancedLogger = {
  // These will only show in console if they're errors
  info: (message, req = null) => {
    // Info messages go to file but not console
    logWithRequest('info', message, req);
  },
  error: (message, req = null) => logWithRequest('error', message, req),
  warn: (message, req = null) => {
    // Warn messages go to file but not console
    logWithRequest('warn', message, req);
  },
  debug: (message, req = null) => {
    // Debug messages go to file but not console
    logWithRequest('debug', message, req);
  },

  // Direct access to winston logger
  stream: {
    write: (message) => logger.info(message.trim())
  }
};

export default logger;