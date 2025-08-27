/**
 * @typedef {Object} NovelMetadata
 * @property {string} title - Novel title
 * @property {string} [author] - Author name (optional)
 * @property {string} [coverUrl] - Cover image URL
 * @property {string} [synopsis] - Novel description
 * @property {string[]} [tags] - Genre/category tags
 * @property {string} [status] - Publication status (ongoing, completed, etc.)
 * @property {number} totalChapters - Total number of chapters
 * @property {string} sourceUrl - Original novel URL
 * @property {Date} crawledAt - Timestamp of crawl
 */

/**
 * @typedef {Object} ChapterInfo
 * @property {number} index - Chapter number/index
 * @property {string} id - Stable chapter identifier
 * @property {string} title - Chapter title
 * @property {string} url - Chapter URL
 * @property {string} [publishedAt] - Publication date if available
 */

/**
 * @typedef {Object} ChapterContent
 * @property {ChapterInfo} info - Chapter information
 * @property {string} content - Chapter content (HTML or Markdown)
 * @property {string[]} [images] - List of image URLs in content
 * @property {Object} [metadata] - Additional chapter metadata
 */

/**
 * @typedef {Object} CrawlerConfig
 * @property {string} url - Target novel URL
 * @property {string} outputDir - Output directory path
 * @property {string} [range] - Chapter range (e.g., "1-50,75,120-")
 * @property {number} [concurrency=2] - Concurrent requests
 * @property {number|string} [delay="1000-2000"] - Delay between requests (ms or range)
 * @property {number} [retries=3] - Retry attempts per request
 * @property {boolean} [epub=false] - Generate EPUB output
 * @property {boolean} [txt=false] - Generate TXT output
 * @property {boolean} [inlineImages=false] - Download and inline images
 * @property {string} [imagesDir="images"] - Images directory name
 * @property {boolean} [respectRobots=true] - Honor robots.txt
 * @property {string} [userAgent] - Custom user agent
 * @property {boolean} [resume=true] - Resume from last checkpoint
 * @property {boolean} [force=false] - Overwrite existing files
 * @property {string} [logLevel="info"] - Logging level
 */

/**
 * @typedef {Object} CrawlerState
 * @property {string} url - Source URL
 * @property {NovelMetadata} metadata - Novel metadata
 * @property {ChapterInfo[]} chapters - All chapter info
 * @property {number} lastCompletedIndex - Last successfully crawled chapter
 * @property {string[]} completedChapters - List of completed chapter IDs
 * @property {Date} lastUpdated - Last state update
 */

/**
 * @typedef {Object} ScrapeResult
 * @property {boolean} success - Whether scrape was successful
 * @property {ChapterContent} [data] - Scraped content if successful
 * @property {Error} [error] - Error if failed
 * @property {number} [retryCount] - Number of retries attempted
 */

export {};
