import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createLogger } from './utils.js';

// Apply stealth plugin
puppeteer.use(StealthPlugin());

/**
 * Browser manager for Puppeteer instances
 */
export class BrowserManager {
  constructor(config = {}) {
    this.config = {
      headless: config.headless !== false,
      timeout: config.timeout || 30000,
      args: config.args || [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      ...config
    };
    
    this.browser = null;
    this.pages = new Map();
    this.logger = createLogger('BrowserManager');
  }

  /**
   * Initialize browser instance
   */
  async init() {
    if (this.browser) return this.browser;

    this.logger.info('Starting browser...');
    
    try {
      // Try to launch with puppeteer-extra
      this.browser = await puppeteer.launch({
        headless: this.config.headless ? 'new' : false, // Use new headless mode
        args: this.config.args,
        defaultViewport: { width: 1366, height: 768 },
        ignoreDefaultArgs: ['--enable-automation'],
        timeout: this.config.timeout,
        // Handle different environments
        ...(process.platform === 'linux' && {
          executablePath: '/usr/bin/google-chrome-stable'
        })
      });

      // Handle browser disconnect
      this.browser.on('disconnected', () => {
        this.logger.warn('Browser disconnected');
        this.browser = null;
        this.pages.clear();
      });

      this.logger.info('Browser started successfully');
      return this.browser;
    } catch (error) {
      this.logger.error('Failed to start browser with puppeteer-extra:', error.message);
      
      // Fallback: try with regular puppeteer
      try {
        this.logger.info('Attempting fallback with regular puppeteer...');
        const puppeteerCore = await import('puppeteer');
        
        this.browser = await puppeteerCore.default.launch({
          headless: this.config.headless ? 'new' : false,
          args: this.config.args,
          defaultViewport: { width: 1366, height: 768 },
          timeout: this.config.timeout
        });
        
        this.logger.info('Browser started with fallback method');
        return this.browser;
      } catch (fallbackError) {
        this.logger.error('Fallback browser launch failed:', fallbackError.message);
        throw new Error(`Browser initialization failed: ${error.message}. Please ensure Chrome/Chromium is installed.`);
      }
    }
  }

  /**
   * Create a new page with standard configuration
   */
  async createPage(pageId = null) {
    await this.init();
    
    const page = await this.browser.newPage();
    
    // Configure page
    await this.setupPage(page);
    
    // Store page reference if ID provided
    if (pageId) {
      this.pages.set(pageId, page);
    }
    
    return page;
  }

  /**
   * Setup page with default configuration
   */
  async setupPage(page) {
    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);
    page.setDefaultNavigationTimeout(this.config.timeout);

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      
      // Block ads, tracking, and non-essential resources
      if (
        resourceType === 'font' ||
        resourceType === 'other' ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.com') ||
        url.includes('doubleclick') ||
        url.includes('amazon-adsystem') ||
        url.includes('/ads/') ||
        url.includes('googlesyndication')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Handle dialogs
    page.on('dialog', async dialog => {
      this.logger.debug(`Dialog: ${dialog.message()}`);
      await dialog.dismiss();
    });

    // Add wait utilities to page
    this.addPageUtilities(page);
  }

  /**
   * Add utility methods to page
   */
  addPageUtilities(page) {
    // Wait for load state
    page.safeWaitForLoadState = async (state = 'networkidle') => {
      const stateMap = {
        'load': 'load',
        'domcontentloaded': 'domcontentloaded',
        'networkidle': 'networkidle0',
        'networkidle0': 'networkidle0',
        'networkidle2': 'networkidle2'
      };
      
      const waitUntil = stateMap[state] || 'networkidle0';
      
      // Always use our custom implementation to avoid conflicts
      await this.waitForNetworkIdle(page);
    };

    // Safe navigation with retries
    page.safeGoto = async (url, options = {}) => {
      const maxRetries = 3;
      let lastError;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: this.config.timeout,
            ...options
          });
          
          if (response && response.ok()) {
            return response;
          }
          
          throw new Error(`HTTP ${response?.status()} ${response?.statusText()}`);
        } catch (error) {
          lastError = error;
          this.logger.warn(`Navigation attempt ${i + 1} failed:`, error.message);
          
          if (i < maxRetries - 1) {
            await this.sleep(1000 * (i + 1)); // Exponential backoff
          }
        }
      }
      
      throw lastError;
    };
  }

  /**
   * Custom network idle implementation
   */
  async waitForNetworkIdle(page, timeout = 30000, idleTime = 500) {
    return new Promise((resolve, reject) => {
      let idleTimer;
      let timeoutTimer;
      
      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        page.off('request', onRequest);
        page.off('response', onResponse);
      };
      
      const onRequest = () => {
        if (idleTimer) clearTimeout(idleTimer);
      };
      
      const onResponse = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, idleTime);
      };
      
      page.on('request', onRequest);
      page.on('response', onResponse);
      
      // Start idle timer
      idleTimer = setTimeout(() => {
        cleanup();
        resolve();
      }, idleTime);
      
      // Overall timeout
      timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error('Network idle timeout'));
      }, timeout);
    });
  }

  /**
   * Get page by ID
   */
  getPage(pageId) {
    return this.pages.get(pageId);
  }

  /**
   * Close page
   */
  async closePage(pageId) {
    const page = this.pages.get(pageId);
    if (page) {
      await page.close();
      this.pages.delete(pageId);
    }
  }

  /**
   * Close all pages
   */
  async closeAllPages() {
    const closePromises = Array.from(this.pages.values()).map(page => 
      page.close().catch(err => this.logger.warn('Error closing page:', err))
    );
    
    await Promise.all(closePromises);
    this.pages.clear();
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    if (this.browser) {
      this.logger.info('Closing browser...');
      
      try {
        await this.closeAllPages();
        await this.browser.close();
      } catch (error) {
        this.logger.error('Error closing browser:', error);
      }
      
      this.browser = null;
    }
  }

  /**
   * Get browser status
   */
  isRunning() {
    return this.browser && this.browser.isConnected();
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}