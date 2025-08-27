import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import sanitizeFilename from 'sanitize-filename';
import pRetry from 'p-retry';

/**
 * Logger with levels and colors
 */
export function createLogger(name, level = 'info') {
  const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  const colors = {
    error: chalk.red,
    warn: chalk.yellow,
    info: chalk.blue,
    debug: chalk.gray
  };

  const currentLevel = levels[level] || levels.info;

  return {
    error: (...args) => currentLevel >= levels.error && console.error(colors.error(`[${name}] ERROR:`), ...args),
    warn: (...args) => currentLevel >= levels.warn && console.warn(colors.warn(`[${name}] WARN:`), ...args),
    info: (...args) => currentLevel >= levels.info && console.log(colors.info(`[${name}] INFO:`), ...args),
    debug: (...args) => currentLevel >= levels.debug && console.log(colors.debug(`[${name}] DEBUG:`), ...args)
  };
}

/**
 * Sleep utility with jitter
 */
export function sleep(ms, jitter = 0) {
  const actualMs = jitter > 0 ? ms + Math.random() * jitter : ms;
  return new Promise(resolve => setTimeout(resolve, actualMs));
}

/**
 * Parse delay string or number into [min, max] range
 */
export function parseDelay(delay) {
  if (typeof delay === 'number') {
    return [delay, delay];
  }
  
  if (typeof delay === 'string') {
    const match = delay.match(/(\d+)(?:-(\d+))?/);
    if (match) {
      const min = parseInt(match[1]);
      const max = match[2] ? parseInt(match[2]) : min;
      return [min, max];
    }
  }
  
  return [1000, 2000]; // Default
}

/**
 * Get random delay within range
 */
export function getRandomDelay(delayRange) {
  const [min, max] = Array.isArray(delayRange) ? delayRange : parseDelay(delayRange);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Parse chapter range string (e.g., "1-50,75,120-")
 */
export function parseRange(rangeStr, totalChapters) {
  if (!rangeStr || rangeStr === 'all') {
    return Array.from({ length: totalChapters }, (_, i) => i + 1);
  }

  const ranges = rangeStr.split(',').map(r => r.trim());
  const chapters = new Set();

  for (const range of ranges) {
    if (range.includes('-')) {
      const [startStr, endStr] = range.split('-');
      const start = parseInt(startStr) || 1;
      const end = endStr ? parseInt(endStr) : totalChapters;
      
      for (let i = start; i <= Math.min(end, totalChapters); i++) {
        chapters.add(i);
      }
    } else {
      const num = parseInt(range);
      if (num > 0 && num <= totalChapters) {
        chapters.add(num);
      }
    }
  }

  return Array.from(chapters).sort((a, b) => a - b);
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Safe file operations
 */
export async function writeFile(filePath, content, encoding = 'utf8') {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, encoding);
}

export async function readFile(filePath, encoding = 'utf8') {
  try {
    return await fs.readFile(filePath, encoding);
  } catch {
    return null;
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize filename for filesystem
 */
export function sanitizeForFilename(text, maxLength = 200) {
  if (!text) return 'untitled';
  
  return sanitizeFilename(text.trim())
    .substring(0, maxLength)
    .replace(/\s+/g, '_')
    .replace(/[^\w\-_.]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Format file size
 */
export function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)}${units[unitIndex]}`;
}

/**
 * Format duration
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 3,
    minTimeout = 1000,
    maxTimeout = 5000,
    factor = 2,
    ...pRetryOptions
  } = options;

  return pRetry(fn, {
    retries,
    minTimeout,
    maxTimeout,
    factor,
    ...pRetryOptions
  });
}

/**
 * Rate limiter
 */
export function createRateLimiter(requestsPerSecond = 1) {
  let lastRequest = 0;
  const interval = 1000 / requestsPerSecond;

  return async function rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequest;
    
    if (timeSinceLastRequest < interval) {
      await sleep(interval - timeSinceLastRequest);
    }
    
    lastRequest = Date.now();
  };
}

/**
 * Progress tracker
 */
export class ProgressTracker {
  constructor(total, name = 'Progress') {
    this.total = total;
    this.current = 0;
    this.name = name;
    this.startTime = Date.now();
    this.errors = 0;
  }

  increment(amount = 1) {
    this.current += amount;
  }

  addError() {
    this.errors++;
  }

  getProgress() {
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / (elapsed / 1000);
    const eta = this.total > this.current ? (this.total - this.current) / rate * 1000 : 0;
    
    return {
      current: this.current,
      total: this.total,
      percentage: Math.round((this.current / this.total) * 100),
      rate: rate.toFixed(2),
      eta: formatDuration(eta),
      elapsed: formatDuration(elapsed),
      errors: this.errors
    };
  }

  formatProgress() {
    const progress = this.getProgress();
    const bar = this.createProgressBar(progress.percentage);
    
    return `${this.name}: ${bar} ${progress.current}/${progress.total} (${progress.percentage}%) ` +
           `[${progress.rate}/s] ETA: ${progress.eta}${progress.errors > 0 ? ` Errors: ${progress.errors}` : ''}`;
  }

  createProgressBar(percentage, width = 20) {
    const filled = Math.round(width * percentage / 100);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }
}

/**
 * Memory usage monitor
 */
export function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: formatFileSize(usage.rss),
    heapTotal: formatFileSize(usage.heapTotal),
    heapUsed: formatFileSize(usage.heapUsed),
    external: formatFileSize(usage.external)
  };
}

/**
 * Clean up process on exit
 */
export function setupGracefulShutdown(cleanupFn) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}. Cleaning up...`);
      
      try {
        if (cleanupFn) await cleanupFn();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
      
      process.exit(0);
    });
  });
  
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    
    try {
      if (cleanupFn) await cleanupFn();
    } catch {}
    
    process.exit(1);
  });
}

/**
 * Validate URL
 */
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deep merge objects
 */
export function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Safe waitForTimeout that works with both older and newer Puppeteer versions
 */
export function safeWaitForTimeout(page, ms) {
  if (typeof page.waitForTimeout === 'function') {
    return page.waitForTimeout(ms);
  } else {
    // Fallback for newer Puppeteer versions
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}