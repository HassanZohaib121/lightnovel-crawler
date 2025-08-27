import pLimit from 'p-limit';
import { BrowserManager } from './browser.js';
import { MtlBooksAdapter } from '../adapters/mtlbooks.js';
import { 
  createLogger, 
  sleep, 
  getRandomDelay, 
  parseRange, 
  retryWithBackoff,
  ProgressTracker,
  writeFile,
  readFile,
  fileExists
} from './utils.js';

/**
 * Main scraping orchestrator
 */
export class Scraper {
  constructor(config) {
    this.config = {
      concurrency: 2,
      delay: [1000, 2000],
      retries: 3,
      resume: true,
      force: false,
      ...config
    };
    
    this.logger = createLogger('Scraper', this.config.logLevel);
    this.browserManager = new BrowserManager(this.config.browser);
    this.adapter = this.createAdapter();
    this.limiter = pLimit(this.config.concurrency);
    this.state = null;
    this.progress = null;
  }

  createAdapter() {
    // For now, only MTLBooks is supported
    const adapter = new MtlBooksAdapter(this.config);
    
    if (!adapter.canHandle(this.config.url)) {
      throw new Error(`No adapter found for URL: ${this.config.url}`);
    }
    
    return adapter;
  }

  /**
   * Main scraping entry point
   */
  async scrape() {
    this.logger.info('Starting scrape process...');
    
    try {
      await this.browserManager.init();
      
      // Load or create state
      await this.loadState();
      
      // Extract novel metadata if not already done
      if (!this.state.metadata) {
        await this.extractMetadata();
      }
      
      // Extract chapter list if not already done
      if (!this.state.chapters || this.state.chapters.length === 0) {
        await this.extractChapterList();
      }
      
      // Determine chapters to scrape
      const chaptersToScrape = this.getChaptersToScrape();
      
      if (chaptersToScrape.length === 0) {
        this.logger.info('No chapters to scrape');
        return this.state;
      }
      
      this.logger.info(`Scraping ${chaptersToScrape.length} chapters with concurrency ${this.config.concurrency}`);
      
      // Initialize progress tracker
      this.progress = new ProgressTracker(chaptersToScrape.length, 'Chapters');
      
      // Scrape chapters
      await this.scrapeChapters(chaptersToScrape);
      
      this.logger.info('Scrape process completed successfully');
      return this.state;
      
    } catch (error) {
      this.logger.error('Scrape process failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Extract novel metadata
   */
  async extractMetadata() {
    this.logger.info('Extracting novel metadata...');
    
    const page = await this.browserManager.createPage('metadata');
    
    try {
      await this.adapter.setupPage(page);
      await page.safeGoto(this.config.url);
      
      const metadata = await this.adapter.extractMetadata(page, this.config.url);
      this.state.metadata = metadata;
      
      await this.saveState();
      this.logger.info(`Extracted metadata for: ${metadata.title}`);
      
    } catch (error) {
      this.logger.error('Failed to extract metadata:', error);
      throw error;
    } finally {
      await this.browserManager.closePage('metadata');
    }
  }

  /**
   * Extract chapter list
   */
  async extractChapterList() {
    this.logger.info('Extracting chapter list...');
    
    const page = await this.browserManager.createPage('chapters');
    
    try {
      await this.adapter.setupPage(page);
      await page.safeGoto(this.config.url);
      
      const chapters = await this.adapter.extractChapterList(page, this.config.url);
      this.state.chapters = chapters;
      this.state.metadata.totalChapters = chapters.length;
      
      await this.saveState();
      this.logger.info(`Extracted ${chapters.length} chapters`);
      
    } catch (error) {
      this.logger.error('Failed to extract chapter list:', error);
      throw error;
    } finally {
      await this.browserManager.closePage('chapters');
    }
  }

  /**
   * Determine which chapters to scrape
   */
  getChaptersToScrape() {
    if (!this.state.chapters || this.state.chapters.length === 0) {
      return [];
    }

    // Parse range if specified
    let targetIndexes = [];
    if (this.config.range) {
      targetIndexes = parseRange(this.config.range, this.state.chapters.length);
    } else {
      targetIndexes = Array.from({ length: this.state.chapters.length }, (_, i) => i + 1);
    }

    // Filter chapters
    const chaptersToScrape = this.state.chapters.filter(chapter => {
      // Check if chapter is in target range
      if (!targetIndexes.includes(chapter.index)) {
        return false;
      }

      // Skip if already completed (unless force mode)
      if (!this.config.force && this.state.completedChapters.includes(chapter.id)) {
        return false;
      }

      return true;
    });

    return chaptersToScrape;
  }

  /**
   * Scrape multiple chapters with concurrency control
   */
  async scrapeChapters(chapters) {
    const tasks = chapters.map(chapter => 
      this.limiter(async () => {
        try {
          await this.scrapeChapter(chapter);
          this.progress.increment();
          
          if (this.progress.current % 10 === 0) {
            console.log(this.progress.formatProgress());
          }
          
        } catch (error) {
          this.progress.addError();
          this.logger.error(`Failed to scrape ${chapter.title}:`, error.message);
          
          // Don't fail the entire process for individual chapter errors
          return { success: false, chapter, error };
        }
      })
    );

    const results = await Promise.all(tasks);
    
    // Log summary
    const successful = results.filter(r => r !== undefined && r.success !== false).length;
    const failed = results.filter(r => r && r.success === false).length;
    
    this.logger.info(`Completed: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      this.logger.warn(`${failed} chapters failed to scrape. Check logs for details.`);
    }
  }

  /**
   * Scrape a single chapter
   */
  async scrapeChapter(chapterInfo) {
    return retryWithBackoff(async () => {
      // Apply rate limiting delay
      const delay = getRandomDelay(this.config.delay);
      await sleep(delay);
      
      const page = await this.browserManager.createPage();
      
      try {
        await this.adapter.setupPage(page);
        
        // Extract chapter content
        const content = await this.adapter.extractChapterContent(page, chapterInfo);
        
        // Save chapter content
        await this.saveChapterContent(content);
        
        // Update state
        if (!this.state.completedChapters.includes(chapterInfo.id)) {
          this.state.completedChapters.push(chapterInfo.id);
        }
        this.state.lastCompletedIndex = Math.max(
          this.state.lastCompletedIndex || 0, 
          chapterInfo.index
        );
        this.state.lastUpdated = new Date();
        
        // Save state periodically
        if (this.state.completedChapters.length % 5 === 0) {
          await this.saveState();
        }
        
        return content;
        
      } catch (error) {
        this.logger.debug(`Scraping ${chapterInfo.title} failed:`, error.message);
        throw error;
      } finally {
        await page.close();
      }
    }, {
      retries: this.config.retries,
      onFailedAttempt: (error) => {
        this.logger.warn(`Retry ${error.attemptNumber}/${this.config.retries + 1} for ${chapterInfo.title}: ${error.message}`);
      }
    });
  }

  /**
   * Save chapter content to file
   */
  async saveChapterContent(content) {
    const { info, content: htmlContent } = content;
    
    // Convert HTML to Markdown
    const markdown = await this.htmlToMarkdown(htmlContent);
    
    // Generate safe filename
    const filename = `${String(info.index).padStart(4, '0')}-${info.id}.md`;
    const filepath = path.join(this.config.outputDir, filename);
    
    // Create chapter markdown with metadata
    const chapterMarkdown = this.createChapterMarkdown(info, markdown, content.metadata);
    
    await writeFile(filepath, chapterMarkdown);
    
    this.logger.debug(`Saved chapter: ${filename}`);
  }

  /**
   * Convert HTML to Markdown
   */
  async htmlToMarkdown(html) {
    // Use turndown for HTML to Markdown conversion
    const TurndownService = (await import('turndown')).default;
    
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**'
    });
    
    // Custom rules
    turndownService.addRule('preserveLineBreaks', {
      filter: 'br',
      replacement: () => '\n\n'
    });
    
    turndownService.addRule('cleanParagraphs', {
      filter: 'p',
      replacement: (content) => `\n\n${content}\n\n`
    });
    
    return turndownService.turndown(html).trim();
  }

  /**
   * Create formatted chapter markdown
   */
  createChapterMarkdown(info, content, metadata) {
    const frontmatter = [
      '---',
      `title: "${info.title}"`,
      `chapter: ${info.index}`,
      `id: "${info.id}"`,
      `url: "${info.url}"`,
      metadata?.wordCount ? `word_count: ${metadata.wordCount}` : '',
      metadata?.extractedAt ? `extracted_at: "${metadata.extractedAt}"` : '',
      '---',
      ''
    ].filter(Boolean).join('\n');
    
    return `${frontmatter}\n# ${info.title}\n\n${content}`;
  }

  /**
   * Load scraper state
   */
  async loadState() {
    const stateFile = path.join(this.config.outputDir, 'state.json');
    
    if (this.config.resume && await fileExists(stateFile)) {
      try {
        const stateData = await readFile(stateFile);
        this.state = JSON.parse(stateData);
        
        // Migrate old state format if needed
        if (!this.state.completedChapters) {
          this.state.completedChapters = [];
        }
        
        this.logger.info(`Resumed from state: ${this.state.completedChapters.length} chapters completed`);
      } catch (error) {
        this.logger.warn('Failed to load state, starting fresh:', error.message);
        this.initState();
      }
    } else {
      this.initState();
    }
  }

  /**
   * Initialize fresh state
   */
  initState() {
    this.state = {
      url: this.config.url,
      metadata: null,
      chapters: [],
      lastCompletedIndex: 0,
      completedChapters: [],
      lastUpdated: new Date()
    };
  }

  /**
   * Save scraper state
   */
  async saveState() {
    const stateFile = path.join(this.config.outputDir, 'state.json');
    await writeFile(stateFile, JSON.stringify(this.state, null, 2));
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.state) {
      await this.saveState();
    }
    
    await this.browserManager.close();
  }
}

// Import path module
import path from 'path';