/**
 * Base site adapter interface - defines the contract for site-specific crawlers
 */
export class SiteAdapter {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
    this.domain = '';
  }

  /**
   * Test if this adapter can handle the given URL
   * @param {string} url - Target URL
   * @returns {boolean}
   */
  canHandle(url) {
    throw new Error('canHandle() must be implemented by subclass');
  }

  /**
   * Extract novel metadata from the main novel page
   * @param {import('puppeteer').Page} page - Puppeteer page instance
   * @param {string} url - Novel URL
   * @returns {Promise<import('../types/models.js').NovelMetadata>}
   */
  async extractMetadata(page, url) {
    throw new Error('extractMetadata() must be implemented by subclass');
  }

  /**
   * Extract chapter list from the novel page
   * @param {import('puppeteer').Page} page - Puppeteer page instance
   * @param {string} url - Novel URL
   * @returns {Promise<import('../types/models.js').ChapterInfo[]>}
   */
  async extractChapterList(page, url) {
    throw new Error('extractChapterList() must be implemented by subclass');
  }

  /**
   * Extract content from a single chapter page
   * @param {import('puppeteer').Page} page - Puppeteer page instance
   * @param {import('../types/models.js').ChapterInfo} chapterInfo - Chapter information
   * @returns {Promise<import('../types/models.js').ChapterContent>}
   */
  async extractChapterContent(page, chapterInfo) {
    throw new Error('extractChapterContent() must be implemented by subclass');
  }

  /**
   * Get site-specific request headers
   * @returns {Object}
   */
  getHeaders() {
    return {
      'User-Agent': this.config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive'
    };
  }

  /**
   * Get site-specific delay range
   * @returns {[number, number]} - [min, max] delay in ms
   */
  getDelayRange() {
    return [1000, 2000]; // Default polite delay
  }

  /**
   * Handle site-specific page setup (cookies, etc.)
   * @param {import('puppeteer').Page} page - Puppeteer page instance
   * @returns {Promise<void>}
   */
  async setupPage(page) {
    // Default: set headers and basic viewport
    await page.setExtraHTTPHeaders(this.getHeaders());
    await page.setViewport({ width: 1366, height: 768 });
  }

  /**
   * Clean and normalize HTML content
   * @param {string} html - Raw HTML content
   * @returns {string} - Cleaned HTML
   */
  cleanContent(html) {
    if (!html) return '';
    
    // Basic cleaning - remove script/style tags, normalize whitespace
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Validate extracted data
   * @param {Object} data - Extracted data to validate
   * @param {string} type - Data type ('metadata', 'chapters', 'content')
   * @returns {boolean}
   */
  validateData(data, type) {
    switch (type) {
      case 'metadata':
        return data && typeof data.title === 'string' && data.title.length > 0;
      case 'chapters':
        return Array.isArray(data) && data.length > 0 && data.every(ch => 
          ch.id && ch.title && ch.url && typeof ch.index === 'number'
        );
      case 'content':
        return data && data.info && typeof data.content === 'string';
      default:
        return false;
    }
  }
}