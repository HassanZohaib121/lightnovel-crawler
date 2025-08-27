#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { Scraper } from './core/scrape.js';
import { OutputManager } from './core/output.js';
import { 
  createLogger, 
  isValidUrl, 
  ensureDir, 
  sanitizeForFilename,
  setupGracefulShutdown,
  getMemoryUsage,
  formatDuration
} from './core/utils.js';

const program = new Command();
const logger = createLogger('CLI');

// Global cleanup handler
let globalScraper = null;
setupGracefulShutdown(async () => {
  if (globalScraper) {
    await globalScraper.cleanup();
  }
});

program
  .name('mtlbooks-crawler')
  .description('Production-grade web novel crawler for MTLBooks.com')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'MTLBooks novel URL')
  .option('-o, --out <dir>', 'Output directory')
  .option('-r, --range <range>', 'Chapter range (e.g., "1-50,75,120-")', 'all')
  .option('-c, --concurrency <num>', 'Concurrent requests', parseInt, 2)
  .option('-d, --delay <ms>', 'Delay between requests (ms or range like "1000-2000")', '1200-2200')
  .option('--retries <num>', 'Retry attempts per request', parseInt, 3)
  .option('--epub', 'Generate EPUB output', false)
  .option('--txt', 'Generate TXT output', false)
  .option('--inline-images', 'Download and inline images', false)
  .option('--images-dir <dir>', 'Images directory name', 'images')
  .option('--no-respect-robots', 'Ignore robots.txt')
  .option('--user-agent <ua>', 'Custom user agent')
  .option('--no-resume', 'Don\'t resume from checkpoint')
  .option('--force', 'Overwrite existing files', false)
  .option('--log-level <level>', 'Log level (error|warn|info|debug)', 'info')
  .option('--headless <bool>', 'Run browser in headless mode', parseBoolean, true)
  .option('--timeout <ms>', 'Page timeout in milliseconds', parseInt, 30000)
  .action(async (options) => {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (!isValidUrl(options.url)) {
        console.error(chalk.red('Error: Invalid URL provided'));
        process.exit(1);
      }

      // Setup output directory
      const outputDir = options.out || generateDefaultOutputDir(options.url);
      await ensureDir(outputDir);

      // Parse delay
      let delay = [1200, 2200];
      if (options.delay) {
        const match = options.delay.match(/(\d+)(?:-(\d+))?/);
        if (match) {
          const min = parseInt(match[1]);
          const max = match[2] ? parseInt(match[2]) : min;
          delay = [min, max];
        }
      }

      // Create configuration
      const config = {
        url: options.url,
        outputDir,
        range: options.range === 'all' ? null : options.range,
        concurrency: Math.max(1, Math.min(options.concurrency, 10)), // Limit concurrency
        delay,
        retries: options.retries,
        epub: options.epub,
        txt: options.txt,
        inlineImages: options.inlineImages,
        imagesDir: options.imagesDir,
        respectRobots: options.respectRobots,
        userAgent: options.userAgent,
        resume: options.resume,
        force: options.force,
        logLevel: options.logLevel,
        browser: {
          headless: options.headless,
          timeout: options.timeout
        }
      };

      console.log(chalk.blue.bold('🚀 MTLBooks Crawler v1.0.0\n'));
      console.log(chalk.cyan('Configuration:'));
      console.log(`  📖 URL: ${config.url}`);
      console.log(`  📁 Output: ${config.outputDir}`);
      console.log(`  🎯 Range: ${config.range || 'all chapters'}`);
      console.log(`  ⚡ Concurrency: ${config.concurrency}`);
      console.log(`  ⏱️  Delay: ${delay[0]}-${delay[1]}ms`);
      console.log(`  📚 EPUB: ${config.epub ? 'enabled' : 'disabled'}`);
      console.log(`  📄 TXT: ${config.txt ? 'enabled' : 'disabled'}`);
      console.log();

      // Initialize scraper
      const spinner = ora('Initializing crawler...').start();
      
      globalScraper = new Scraper(config);
      
      spinner.succeed('Crawler initialized');
      
      // Start scraping
      spinner.start('Starting scrape process...');
      
      const state = await globalScraper.scrape();
      
      spinner.succeed('Scraping completed');
      
      // Generate outputs
      spinner.start('Generating outputs...');
      
      const outputManager = new OutputManager(config, state);
      await outputManager.generate();
      await outputManager.generateReport();
      
      spinner.succeed('Outputs generated');
      
      // Show summary
      const duration = Date.now() - startTime;
      const memory = getMemoryUsage();
      
      console.log(chalk.green.bold('\n✅ Crawl completed successfully!\n'));
      console.log(chalk.cyan('Summary:'));
      console.log(`  📚 Novel: ${state.metadata?.title || 'Unknown'}`);
      console.log(`  📖 Total Chapters: ${state.chapters?.length || 0}`);
      console.log(`  ✅ Completed: ${state.completedChapters?.length || 0}`);
      console.log(`  ⏱️  Duration: ${formatDuration(duration)}`);
      console.log(`  💾 Memory Peak: ${memory.rss}`);
      console.log(`  📁 Output: ${config.outputDir}`);
      
      if (config.epub && state.completedChapters?.length > 0) {
        const epubFile = sanitizeForFilename(state.metadata?.title || 'novel') + '.epub';
        console.log(`  📘 EPUB: ${epubFile}`);
      }
      
      if (config.txt && state.completedChapters?.length > 0) {
        const txtFile = sanitizeForFilename(state.metadata?.title || 'novel') + '.txt';
        console.log(`  📄 TXT: ${txtFile}`);
      }
      
      console.log(chalk.green('\n🎉 Happy reading!'));

    } catch (error) {
      console.error(chalk.red.bold('\n❌ Crawl failed:'));
      console.error(chalk.red(error.message));
      
      if (options.logLevel === 'debug') {
        console.error(chalk.gray('\nStack trace:'));
        console.error(error.stack);
      }
      
      process.exit(1);
    }
  });

/**
 * Parse boolean option
 */
function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value);
}

/**
 * Generate default output directory from URL
 */
function generateDefaultOutputDir(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'novel';
    const sanitized = sanitizeForFilename(lastPart);
    return path.join('./downloads', sanitized);
  } catch {
    return './downloads/novel';
  }
}

// Handle command line parsing errors
program.exitOverride();

try {
  program.parse();
} catch (error) {
  if (error.code === 'commander.missingRequiredOption') {
    console.error(chalk.red('Error: Missing required option'));
    console.error(chalk.yellow('\nUsage:'));
    console.error('  mtlbooks-crawler -u "https://mtlbooks.com/novel/example"');
    console.error('\nFor more help:');
    console.error('  mtlbooks-crawler --help');
    process.exit(1);
  }
  throw error;
}