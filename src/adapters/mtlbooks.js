import { SiteAdapter } from './siteAdapter.js';
import { createLogger } from '../core/utils.js';
import { safeWaitForTimeout } from '../core/utils.js';

/**
 * MTLBooks.com specific crawler adapter
 */
export class MtlBooksAdapter extends SiteAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'mtlbooks';
    this.domain = 'mtlbooks.com';
    this.logger = createLogger('MtlBooksAdapter');
  }

  canHandle(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('mtlbooks.com');
    } catch {
      return false;
    }
  }

  async extractMetadata(page, url) {
    this.logger.info(`Extracting metadata from: ${url}`);
    
    try {
      // Wait for page to load
      await page.safeWaitForLoadState('networkidle');
      
      // Extract novel metadata using multiple selector strategies
      const metadata = await page.evaluate(() => {
        // Helper function to safely get text content
        const getText = (selector, fallbacks = []) => {
          const selectors = [selector, ...fallbacks];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el.textContent?.trim() || '';
          }
          return '';
        };

        // Helper function to get attribute
        const getAttr = (selector, attr, fallbacks = []) => {
          const selectors = [selector, ...fallbacks];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el.getAttribute(attr)?.trim() || '';
          }
          return '';
        };

        // Extract title
        const title = getText(
          '.novel-title',
          ['.book-title', '.title', 'h1', '.novel-name', '.book-name']
        );

        // Extract author
        const author = getText(
          '.novel-author',
          ['.author', '.book-author', '[class*="author"]']
        );

        // Extract cover URL
        const coverUrl = getAttr(
          '.novel-cover img',
          'src',
          ['.book-cover img', '.cover img', '.novel-image img']
        );

        // Extract synopsis
        const synopsis = getText(
          '.novel-description',
          ['.description', '.summary', '.synopsis', '.book-description', '.novel-summary']
        );

        // Extract tags
        const tagElements = document.querySelectorAll('.novel-tags .tag, .tags .tag, .genre, .category');
        const tags = Array.from(tagElements).map(el => el.textContent?.trim()).filter(Boolean);

        // Extract status
        const status = getText(
          '.novel-status',
          ['.status', '.book-status', '[class*="status"]']
        );

        // Count total chapters from chapter list or info
        let totalChapters = 0;
        const chapterCountText = getText(
          '.chapter-count',
          ['.total-chapters', '.chapters-count', '[class*="chapter"][class*="count"]']
        );
        
        if (chapterCountText) {
          const match = chapterCountText.match(/(\d+)/);
          if (match) totalChapters = parseInt(match[1]);
        }

        // Fallback: count chapter links
        if (totalChapters === 0) {
          const chapterLinks = document.querySelectorAll(
            '.chapter-list a, .chapters a, [class*="chapter"] a[href*="chapter"]'
          );
          totalChapters = chapterLinks.length;
        }

        return {
          title,
          author: author || undefined,
          coverUrl: coverUrl ? new URL(coverUrl, window.location.origin).href : undefined,
          synopsis: synopsis || undefined,
          tags: tags.length > 0 ? tags : undefined,
          status: status || undefined,
          totalChapters,
          sourceUrl: window.location.href,
          crawledAt: new Date().toISOString()
        };
      });

      // Validate extracted metadata
      if (!this.validateData(metadata, 'metadata')) {
        throw new Error('Failed to extract valid metadata - title is required');
      }

      this.logger.info(`Extracted metadata for: ${metadata.title} (${metadata.totalChapters} chapters)`);
      return metadata;

    } catch (error) {
      this.logger.error('Failed to extract metadata:', error);
      throw new Error(`Metadata extraction failed: ${error.message}`);
    }
  }

  async extractChapterList(page, url) {
    this.logger.info('Extracting chapter list...');
    
    try {
      // Wait for chapter list to load
      await page.safeWaitForLoadState('networkidle');
      
      // Handle "Load More" buttons or pagination
      await this.loadAllChapters(page);

      const chapters = await page.evaluate(() => {
        // Find chapter container using multiple selectors
        const containerSelectors = [
          '.chapter-list',
          '.chapters',
          '.chapter-container',
          '[class*="chapter"][class*="list"]',
          '.table-of-contents',
          '.toc'
        ];

        let container = null;
        for (const selector of containerSelectors) {
          container = document.querySelector(selector);
          if (container) break;
        }

        if (!container) {
          // Fallback: find links that look like chapters
          const allLinks = Array.from(document.querySelectorAll('a[href*="chapter"]'));
          if (allLinks.length === 0) {
            throw new Error('No chapter list container or chapter links found');
          }
          container = document.body;
        }

        // Extract chapter links
        const chapterSelectors = [
          'a[href*="chapter"]',
          '.chapter-link',
          '.chapter-item a',
          'a[class*="chapter"]'
        ];

        let chapterLinks = [];
        for (const selector of chapterSelectors) {
          chapterLinks = Array.from(container.querySelectorAll(selector));
          if (chapterLinks.length > 0) break;
        }

        if (chapterLinks.length === 0) {
          throw new Error('No chapter links found');
        }

        // Process and normalize chapters
        const chapters = chapterLinks
          .map((link, index) => {
            const url = link.href;
            const title = (link.textContent || link.title || '').trim();
            
            // Extract chapter number from URL or title
            let chapterNum = index + 1;
            const urlMatch = url.match(/chapter[_-]?(\d+)/i);
            const titleMatch = title.match(/(?:chapter|ch\.?)\s*(\d+)/i);
            
            if (urlMatch) chapterNum = parseInt(urlMatch[1]);
            else if (titleMatch) chapterNum = parseInt(titleMatch[1]);

            // Generate stable ID
            const id = `chapter-${chapterNum}`;

            return {
              index: chapterNum,
              id,
              title: title || `Chapter ${chapterNum}`,
              url: new URL(url, window.location.origin).href
            };
          })
          .filter(ch => ch.url && ch.title) // Remove invalid entries
          .sort((a, b) => a.index - b.index); // Sort by chapter number

        return chapters;
      });

      if (!this.validateData(chapters, 'chapters')) {
        throw new Error('Failed to extract valid chapter list');
      }

      this.logger.info(`Extracted ${chapters.length} chapters`);
      return chapters;

    } catch (error) {
      this.logger.error('Failed to extract chapter list:', error);
      throw new Error(`Chapter list extraction failed: ${error.message}`);
    }
  }

  async extractChapterContent(page, chapterInfo) {
    this.logger.debug(`Extracting content for: ${chapterInfo.title}`);
    
    try {
      await page.goto(chapterInfo.url, { waitUntil: 'networkidle2' });
      
      const content = await page.evaluate(() => {
        // Content container selectors
        const contentSelectors = [
          '.chapter-content',
          '.content',
          '.chapter-body',
          '.novel-content',
          '.reader-content',
          '.text-content',
          '#content',
          '.post-content',
          '[class*="content"]'
        ];

        let contentContainer = null;
        for (const selector of contentSelectors) {
          contentContainer = document.querySelector(selector);
          if (contentContainer && contentContainer.textContent.trim().length > 100) {
            break;
          }
        }

        if (!contentContainer) {
          throw new Error('Content container not found');
        }

        // Clean up the content
        const clonedContainer = contentContainer.cloneNode(true);
        
        // Remove unwanted elements
        const unwantedSelectors = [
          'script', 'style', 'nav', 'header', 'footer',
          '.ads', '.advertisement', '.banner',
          '.social-share', '.comments', '.navigation',
          '.prev-next', '.chapter-nav'
        ];
        
        unwantedSelectors.forEach(selector => {
          clonedContainer.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Extract images for processing
        const images = Array.from(clonedContainer.querySelectorAll('img'))
          .map(img => ({
            src: img.src ? new URL(img.src, window.location.origin).href : '',
            alt: img.alt || '',
            title: img.title || ''
          }))
          .filter(img => img.src);

        // Get the cleaned HTML content
        let htmlContent = clonedContainer.innerHTML;
        
        // Basic cleanup
        htmlContent = htmlContent
          .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();

        return {
          content: htmlContent,
          images: images.map(img => img.src),
          wordCount: clonedContainer.textContent.trim().split(/\s+/).length
        };
      });

      const result = {
        info: chapterInfo,
        content: this.cleanContent(content.content),
        images: content.images || [],
        metadata: {
          wordCount: content.wordCount || 0,
          extractedAt: new Date().toISOString()
        }
      };

      if (!this.validateData(result, 'content')) {
        throw new Error('Extracted content is invalid or empty');
      }

      this.logger.debug(`Extracted ${result.metadata.wordCount} words from ${chapterInfo.title}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to extract content for ${chapterInfo.title}:`, error);
      throw new Error(`Content extraction failed: ${error.message}`);
    }
  }

  async loadAllChapters(page) {
    // Handle lazy loading or "Load More" buttons
    let loadMoreFound = true;
    let attempts = 0;
    const maxAttempts = 10;

    while (loadMoreFound && attempts < maxAttempts) {
      loadMoreFound = await page.evaluate(() => {
        // Look for "Load More" or pagination buttons
        const loadMoreSelectors = [
          'button[class*="load-more"]',
          'button[class*="show-more"]',
          '.load-more-chapters',
          '.pagination .next:not(.disabled)',
          '[data-action="load-more"]'
        ];

        for (const selector of loadMoreSelectors) {
          const btn = document.querySelector(selector);
          if (btn && !btn.disabled && btn.style.display !== 'none') {
            btn.click();
            return true;
          }
        }
        return false;
      });

              if (loadMoreFound) {
          await safeWaitForTimeout(page, 2000); // Wait for content to load
          attempts++;
        }
    }

    // Auto-scroll to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await safeWaitForTimeout(page, 1000);
  }

  getDelayRange() {
    return [1200, 2200]; // Slightly more conservative for MTLBooks
  }

  cleanContent(html) {
    if (!html) return '';
    
    return super.cleanContent(html)
      // Remove common MTLBooks specific elements
      .replace(/<div[^>]*class="[^"]*ads[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="[^"]*banner[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      // Clean up paragraph spacing
      .replace(/(<\/p>)\s*(<p[^>]*>)/gi, '$1\n\n$2')
      // Preserve line breaks in content
      .replace(/<br\s*\/?>/gi, '\n');
  }
}