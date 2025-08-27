#!/usr/bin/env node

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './core/utils.js';
import { Scraper } from './core/scrape.js';
import { OutputManager } from './core/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const logger = createLogger('WebUI');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web-ui')));

// Store active crawls
const activeCrawls = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web-ui', 'index.html'));
});

app.get('/api/status', (req, res) => {
  const status = {
    activeCrawls: activeCrawls.size,
    crawls: Array.from(activeCrawls.values()).map(crawl => ({
      id: crawl.id,
      url: crawl.config.url,
      status: crawl.status,
      progress: crawl.progress,
      startTime: crawl.startTime,
      completedChapters: crawl.completedChapters || 0,
      totalChapters: crawl.totalChapters || 0
    }))
  };
  res.json(status);
});

app.post('/api/crawl', async (req, res) => {
  try {
    const { url, range, concurrency, delay, epub, txt, headless, logLevel } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Create crawl configuration
    const config = {
      url,
      outputDir: null, // Will be auto-generated
      range: range === 'all' ? null : range,
      concurrency: Math.max(1, Math.min(concurrency || 2, 10)),
      delay: delay || [1200, 2200],
      retries: 3,
      epub: epub || false,
      txt: txt || false,
      inlineImages: false,
      imagesDir: 'images',
      respectRobots: true,
      resume: true,
      force: false,
      logLevel: logLevel || 'info',
      browser: {
        headless: headless !== false,
        timeout: 30000
      }
    };

    // Generate output directory
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || 'novel';
      const sanitized = lastPart.replace(/[^a-z0-9]/gi, '_');
      config.outputDir = path.join('./downloads', sanitized);
    } catch {
      config.outputDir = './downloads/novel';
    }

    // Create crawl ID
    const crawlId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize crawler
    const scraper = new Scraper(config);
    
    // Store crawl info
    const crawlInfo = {
      id: crawlId,
      config,
      scraper,
      status: 'starting',
      progress: 0,
      startTime: new Date(),
      completedChapters: 0,
      totalChapters: 0,
      error: null
    };
    
    activeCrawls.set(crawlId, crawlInfo);

    // Start crawling in background
    startCrawl(crawlId, scraper, config);

    res.json({ 
      success: true, 
      crawlId,
      message: 'Crawl started successfully' 
    });

  } catch (error) {
    logger.error('Failed to start crawl:', error);
    res.status(500).json({ 
      error: 'Failed to start crawl', 
      details: error.message 
    });
  }
});

app.delete('/api/crawl/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const crawl = activeCrawls.get(id);
    
    if (!crawl) {
      return res.status(404).json({ error: 'Crawl not found' });
    }

    // Stop the crawler
    if (crawl.scraper) {
      await crawl.scraper.cleanup();
    }
    
    // Update status
    crawl.status = 'stopped';
    activeCrawls.delete(id);
    
    res.json({ success: true, message: 'Crawl stopped' });
    
  } catch (error) {
    logger.error('Failed to stop crawl:', error);
    res.status(500).json({ error: 'Failed to stop crawl' });
  }
});

app.get('/api/crawl/:id/logs', (req, res) => {
  const { id } = req.params;
  const crawl = activeCrawls.get(id);
  
  if (!crawl) {
    return res.status(404).json({ error: 'Crawl not found' });
  }

  // Return recent logs (in a real implementation, you'd store logs)
  res.json({ 
    logs: [
      { timestamp: new Date().toISOString(), level: 'info', message: 'Crawl logs will be implemented in future versions' }
    ]
  });
});

// Helper function to start crawl in background
async function startCrawl(crawlId, scraper, config) {
  const crawl = activeCrawls.get(crawlId);
  if (!crawl) return;

  try {
    crawl.status = 'running';
    
    // Start scraping
    const state = await scraper.scrape();
    
    // Update progress
    crawl.totalChapters = state.chapters?.length || 0;
    crawl.completedChapters = state.completedChapters?.length || 0;
    crawl.progress = crawl.totalChapters > 0 ? (crawl.completedChapters / crawl.totalChapters) * 100 : 0;
    
    // Generate outputs
    if (config.epub || config.txt) {
      const outputManager = new OutputManager(config, state);
      await outputManager.generate();
      await outputManager.generateReport();
    }
    
    crawl.status = 'completed';
    crawl.progress = 100;
    
    logger.info(`Crawl ${crawlId} completed successfully`);
    
  } catch (error) {
    crawl.status = 'failed';
    crawl.error = error.message;
    logger.error(`Crawl ${crawlId} failed:`, error);
  }
}

// Start server
app.listen(PORT, () => {
  logger.info(`Web UI server running on http://localhost:${PORT}`);
  logger.info('Open your browser and navigate to the URL above');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down web UI server...');
  
  // Stop all active crawls
  for (const [id, crawl] of activeCrawls) {
    try {
      if (crawl.scraper) {
        await crawl.scraper.cleanup();
      }
    } catch (error) {
      logger.error(`Error stopping crawl ${id}:`, error);
    }
  }
  
  process.exit(0);
});
