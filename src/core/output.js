import fs from 'fs/promises';
import path from 'path';
import { createLogger, writeFile, readFile, fileExists, sanitizeForFilename } from './utils.js';

/**
 * Output manager for generating various formats
 */
export class OutputManager {
  constructor(config, state) {
    this.config = config;
    this.state = state;
    this.logger = createLogger('OutputManager', config.logLevel);
  }

  /**
   * Generate all output formats
   */
  async generate() {
    this.logger.info('Generating output files...');
    
    try {
      // Always generate index.json
      await this.generateIndex();
      
      // Generate EPUB if requested
      if (this.config.epub) {
        await this.generateEpub();
      }
      
      // Generate TXT if requested
      if (this.config.txt) {
        await this.generateTxt();
      }
      
      this.logger.info('Output generation completed');
    } catch (error) {
      this.logger.error('Output generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate index.json with novel metadata and chapter list
   */
  async generateIndex() {
    const indexData = {
      novel: {
        ...this.state.metadata,
        crawledAt: this.state.lastUpdated || this.state.metadata?.crawledAt,
        totalChapters: this.state.chapters?.length || 0,
        completedChapters: this.state.completedChapters?.length || 0
      },
      chapters: this.state.chapters?.map(ch => ({
        ...ch,
        filename: `${String(ch.index).padStart(4, '0')}-${ch.id}.md`,
        completed: this.state.completedChapters?.includes(ch.id) || false
      })) || [],
      metadata: {
        crawlerVersion: '1.0.0',
        crawlerConfig: {
          url: this.config.url,
          range: this.config.range,
          concurrency: this.config.concurrency,
          delay: this.config.delay
        },
        statistics: {
          totalChapters: this.state.chapters?.length || 0,
          completedChapters: this.state.completedChapters?.length || 0,
          failedChapters: Math.max(0, (this.state.chapters?.length || 0) - (this.state.completedChapters?.length || 0)),
          lastUpdated: this.state.lastUpdated
        }
      }
    };

    const indexPath = path.join(this.config.outputDir, 'index.json');
    await writeFile(indexPath, JSON.stringify(indexData, null, 2));
    
    this.logger.info(`Generated index.json with ${indexData.chapters.length} chapters`);
  }

  /**
   * Generate EPUB file
   */
  async generateEpub() {
    this.logger.info('Generating EPUB...');
    
    try {
      // Dynamic import for epub-gen
      const Epub = (await import('epub-gen')).default;
      
      const chapters = await this.loadChapterContents();
      
      if (chapters.length === 0) {
        this.logger.warn('No chapters found for EPUB generation');
        return;
      }

      const epubOptions = {
        title: this.state.metadata?.title || 'Untitled Novel',
        author: this.state.metadata?.author || 'Unknown Author',
        description: this.state.metadata?.synopsis || '',
        cover: this.state.metadata?.coverUrl,
        content: chapters.map(chapter => ({
          title: chapter.title,
          data: this.markdownToHtml(chapter.content),
          excludeFromToc: false,
          beforeToc: false
        })),
        css: `
          body { font-family: serif; line-height: 1.6; margin: 2em; }
          h1 { font-size: 1.5em; margin: 1em 0; }
          h2 { font-size: 1.3em; margin: 0.8em 0; }
          p { margin: 1em 0; text-indent: 1.5em; }
          .chapter-title { text-align: center; margin: 2em 0; }
        `,
        fonts: [],
        lang: 'en',
        tocTitle: 'Table of Contents',
        appendChapterTitles: true,
        customOpfTemplatePath: null,
        customNcxTocTemplatePath: null,
        customHtmlTocTemplatePath: null,
        verbose: false
      };

      const filename = sanitizeForFilename(this.state.metadata?.title || 'novel') + '.epub';
      const epubPath = path.join(this.config.outputDir, filename);
      
      await new Promise((resolve, reject) => {
        new Epub(epubOptions, epubPath)
          .promise
          .then(() => {
            this.logger.info(`Generated EPUB: ${filename}`);
            resolve();
          })
          .catch(reject);
      });
      
    } catch (error) {
      this.logger.error('EPUB generation failed:', error);
      // Don't throw - EPUB generation is optional
    }
  }

  /**
   * Generate TXT file
   */
  async generateTxt() {
    this.logger.info('Generating TXT...');
    
    try {
      const chapters = await this.loadChapterContents();
      
      if (chapters.length === 0) {
        this.logger.warn('No chapters found for TXT generation');
        return;
      }

      // Create TXT content
      const txtContent = [];
      
      // Add novel header
      const novel = this.state.metadata || {};
      txtContent.push(`Title: ${novel.title || 'Untitled Novel'}`);
      if (novel.author) txtContent.push(`Author: ${novel.author}`);
      if (novel.synopsis) txtContent.push(`Synopsis: ${novel.synopsis}`);
      if (novel.tags && novel.tags.length > 0) txtContent.push(`Tags: ${novel.tags.join(', ')}`);
      txtContent.push(`Source: ${this.state.url}`);
      txtContent.push(`Crawled: ${new Date(this.state.lastUpdated || Date.now()).toLocaleString()}`);
      txtContent.push('');
      txtContent.push('='.repeat(80));
      txtContent.push('');

      // Add chapters
      for (const chapter of chapters) {
        txtContent.push(`Chapter ${chapter.index}: ${chapter.title}`);
        txtContent.push('='.repeat(60));
        txtContent.push('');
        
        // Convert markdown to plain text
        const plainText = this.markdownToPlainText(chapter.content);
        txtContent.push(plainText);
        
        txtContent.push('');
        txtContent.push('='.repeat(60));
        txtContent.push('');
      }

      const filename = sanitizeForFilename(novel.title || 'novel') + '.txt';
      const txtPath = path.join(this.config.outputDir, filename);
      
      await writeFile(txtPath, txtContent.join('\n'));
      this.logger.info(`Generated TXT: ${filename}`);
      
    } catch (error) {
      this.logger.error('TXT generation failed:', error);
      // Don't throw - TXT generation is optional
    }
  }

  /**
   * Load chapter contents from markdown files
   */
  async loadChapterContents() {
    const chapters = [];
    
    if (!this.state.chapters) {
      return chapters;
    }

    for (const chapterInfo of this.state.chapters) {
      if (!this.state.completedChapters?.includes(chapterInfo.id)) {
        continue; // Skip incomplete chapters
      }

      const filename = `${String(chapterInfo.index).padStart(4, '0')}-${chapterInfo.id}.md`;
      const filepath = path.join(this.config.outputDir, filename);
      
      if (await fileExists(filepath)) {
        try {
          const content = await readFile(filepath);
          const { frontmatter, markdown } = this.parseFrontmatter(content);
          
          chapters.push({
            ...chapterInfo,
            content: markdown,
            metadata: frontmatter
          });
        } catch (error) {
          this.logger.warn(`Failed to load chapter ${filename}:`, error.message);
        }
      }
    }

    // Sort by chapter index
    chapters.sort((a, b) => a.index - b.index);
    
    this.logger.debug(`Loaded ${chapters.length} chapters for EPUB`);
    return chapters;
  }

  /**
   * Parse frontmatter from markdown
   */
  parseFrontmatter(content) {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    if (match) {
      const frontmatterText = match[1];
      const markdown = match[2];
      
      // Simple YAML parsing for our known fields
      const frontmatter = {};
      frontmatterText.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
          frontmatter[key] = value;
        }
      });
      
      return { frontmatter, markdown };
    }
    
    return { frontmatter: {}, markdown: content };
  }

  /**
   * Convert Markdown to HTML for EPUB
   */
  markdownToHtml(markdown) {
    if (!markdown) return '';
    
    // Basic Markdown to HTML conversion
    return markdown
      // Headers
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      
      // Bold and italic
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      
      // Line breaks and paragraphs
      .split('\n\n')
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph.length > 0)
      .map(paragraph => {
        // Skip if already has HTML tags
        if (paragraph.startsWith('<')) {
          return paragraph;
        }
        return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');
  }

  /**
   * Convert Markdown to plain text for TXT
   */
  markdownToPlainText(markdown) {
    if (!markdown) return '';
    
    return markdown
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove markdown bold/italic
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      // Remove markdown links but keep text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Remove markdown code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]*)`/g, '$1')
      // Clean up extra whitespace
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Generate reading statistics
   */
  async generateStats() {
    if (!this.state.chapters) {
      return null;
    }

    const stats = {
      totalChapters: this.state.chapters.length,
      completedChapters: this.state.completedChapters?.length || 0,
      totalWords: 0,
      averageWordsPerChapter: 0,
      estimatedReadingTime: 0 // in minutes
    };

    // Calculate word counts from completed chapters
    let totalWords = 0;
    let chaptersWithWordCount = 0;

    for (const chapterInfo of this.state.chapters) {
      if (!this.state.completedChapters?.includes(chapterInfo.id)) {
        continue;
      }

      const filename = `${String(chapterInfo.index).padStart(4, '0')}-${chapterInfo.id}.md`;
      const filepath = path.join(this.config.outputDir, filename);
      
      if (await fileExists(filepath)) {
        try {
          const content = await readFile(filepath);
          const { markdown } = this.parseFrontmatter(content);
          
          // Count words (simple approximation)
          const wordCount = markdown.split(/\s+/).filter(word => word.length > 0).length;
          totalWords += wordCount;
          chaptersWithWordCount++;
        } catch (error) {
          // Ignore read errors for stats
        }
      }
    }

    stats.totalWords = totalWords;
    stats.averageWordsPerChapter = chaptersWithWordCount > 0 ? Math.round(totalWords / chaptersWithWordCount) : 0;
    stats.estimatedReadingTime = Math.round(totalWords / 200); // Assuming 200 words per minute

    return stats;
  }

  /**
   * Create a summary report
   */
  async generateReport() {
    const stats = await this.generateStats();
    const novel = this.state.metadata || {};
    
    const report = [
      '# Crawl Report',
      '',
      `**Novel:** ${novel.title || 'Unknown'}`,
      `**Author:** ${novel.author || 'Unknown'}`,
      `**Source:** ${this.state.url}`,
      `**Crawled:** ${new Date(this.state.lastUpdated || Date.now()).toLocaleString()}`,
      '',
      '## Statistics',
      '',
      `- Total Chapters: ${stats?.totalChapters || 0}`,
      `- Completed: ${stats?.completedChapters || 0}`,
      `- Success Rate: ${stats?.totalChapters ? Math.round((stats.completedChapters / stats.totalChapters) * 100) : 0}%`,
      `- Total Words: ${stats?.totalWords?.toLocaleString() || 0}`,
      `- Average Words/Chapter: ${stats?.averageWordsPerChapter?.toLocaleString() || 0}`,
      `- Estimated Reading Time: ${Math.floor((stats?.estimatedReadingTime || 0) / 60)}h ${(stats?.estimatedReadingTime || 0) % 60}m`,
      '',
      '## Configuration',
      '',
      `- Concurrency: ${this.config.concurrency}`,
      `- Delay: ${Array.isArray(this.config.delay) ? this.config.delay.join('-') : this.config.delay}ms`,
      `- Range: ${this.config.range || 'all'}`,
      `- EPUB Generated: ${this.config.epub ? 'Yes' : 'No'}`,
      `- TXT Generated: ${this.config.txt ? 'Yes' : 'No'}`,
      ''
    ];

    if (novel.synopsis) {
      report.push('## Synopsis', '', novel.synopsis, '');
    }

    if (novel.tags && novel.tags.length > 0) {
      report.push('## Tags', '', novel.tags.map(tag => `- ${tag}`).join('\n'), '');
    }

    const reportPath = path.join(this.config.outputDir, 'README.md');
    await writeFile(reportPath, report.join('\n'));
    
    this.logger.info('Generated crawl report: README.md');
  }
}