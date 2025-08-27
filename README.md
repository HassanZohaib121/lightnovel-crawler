# MTLBooks Crawler

A production-grade web novel crawler for [MTLBooks.com](https://mtlbooks.com) built with Node.js. Features robust scraping, resumable downloads, EPUB generation, and clean Markdown output.

## 🚀 Features

- **Web Interface**: User-friendly web UI for easy configuration and monitoring
- **Robust Scraping**: Uses Puppeteer with stealth plugin to handle client-rendered pages
- **Resumable Downloads**: Automatic checkpointing and resume capability
- **Rate Limiting**: Configurable delays and concurrency with respect for site resources  
- **Multiple Outputs**: Markdown files, JSON index, EPUB, and TXT generation
- **Error Recovery**: Retry logic with exponential backoff
- **Progress Tracking**: Real-time progress display with ETA
- **Clean Architecture**: Extensible adapter pattern for supporting multiple sites

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd mtlbooks-crawler

# Install dependencies
npm install

# Make executable (optional)
npm link
```

## 🎯 Quick Start

### Web UI (Recommended)
```bash
# Start the web interface
npm run web

# Open your browser to http://localhost:3000
# Use the friendly web interface to configure and monitor crawls
```

### Command Line
```bash
# Download all chapters
node src/index.js --url "https://mtlbooks.com/novel/example-novel"

# Download specific chapters with EPUB output
node src/index.js --url "https://mtlbooks.com/novel/example" --range "1-50,75,120-" --epub

# Download with TXT output
node src/index.js --url "https://mtlbooks.com/novel/example" --txt

# Custom output directory with higher concurrency
node src/index.js -u "https://mtlbooks.com/novel/example" -o ./my-novels/example -c 4
```

## 🌐 Web Interface

The web UI provides a user-friendly way to manage crawls without using the command line.

### Starting the Web UI
```bash
npm run web
```

Then open your browser to `http://localhost:3000`

### Web UI Features
- **Easy Configuration**: Fill out a simple form instead of remembering command-line options
- **Real-time Monitoring**: Watch crawl progress with live updates
- **Visual Progress**: See progress bars and status indicators
- **Manage Crawls**: Start, stop, and monitor multiple crawls simultaneously
- **Responsive Design**: Works on desktop and mobile devices

### Web UI Screenshots
- Configuration form with all options
- Live crawl monitoring with progress bars
- Status overview of all active crawls
- Help modal with usage tips

## 📖 Usage

### Web UI
1. Start the web server: `npm run web`
2. Open `http://localhost:3000` in your browser
3. Fill out the crawl configuration form
4. Click "Start Crawl" and monitor progress
5. Download completed files from the downloads folder

### Command Line

```bash
node src/index.js --url <NOVEL_URL> [OPTIONS]
```

### Required Options

- `-u, --url <url>` - MTLBooks novel URL (required)

### Optional Parameters

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --out <dir>` | Output directory | `./downloads/<novel-name>` |
| `-r, --range <range>` | Chapter range (e.g., "1-50,75,120-") | `all` |
| `-c, --concurrency <num>` | Concurrent requests (1-10) | `2` |
| `-d, --delay <ms>` | Delay between requests | `1200-2200` |
| `--retries <num>` | Retry attempts per request | `3` |
| `--epub` | Generate EPUB output | `false` |
| `--txt` | Generate TXT output | `false` |
| `--inline-images` | Download and inline images | `false` |
| `--images-dir <dir>` | Images directory name | `images` |
| `--no-respect-robots` | Ignore robots.txt | - |
| `--user-agent <ua>` | Custom user agent | - |
| `--no-resume` | Don't resume from checkpoint | - |
| `--force` | Overwrite existing files | `false` |
| `--log-level <level>` | Log level (error/warn/info/debug) | `info` |
| `--headless <bool>` | Run browser in headless mode | `true` |
| `--timeout <ms>` | Page timeout | `30000` |

### Range Syntax

The `--range` parameter supports flexible chapter selection:

- `all` - Download all chapters (default)
- `1-50` - Chapters 1 through 50
- `75` - Only chapter 75
- `120-` - Chapter 120 to the end
- `1-10,25,50-60` - Multiple ranges and individual chapters

## 📁 Output Structure

```
output-directory/
├── index.json              # Novel metadata and chapter index
├── README.md               # Crawl report with statistics  
├── state.json              # Crawler state for resuming
├── 0001-chapter-1.md       # Chapter files in Markdown
├── 0002-chapter-2.md
├── ...
├── novel-title.epub        # EPUB file (if --epub enabled)
├── novel-title.txt         # TXT file (if --txt enabled)
└── images/                 # Downloaded images (if --inline-images)
    ├── image1.jpg
    └── ...
```

### Chapter File Format

Each chapter is saved as Markdown with YAML frontmatter:

```markdown
---
title: "Chapter 1: The Beginning"
chapter: 1
id: "chapter-1"  
url: "https://mtlbooks.com/novel/example/chapter-1"
word_count: 2345
extracted_at: "2024-01-15T10:30:00.000Z"
---

# Chapter 1: The Beginning

Chapter content goes here...
```

### Index JSON Structure

```json
{
  "novel": {
    "title": "Novel Title",
    "author": "Author Name",
    "synopsis": "Novel description...",
    "totalChapters": 150,
    "completedChapters": 150,
    "crawledAt": "2024-01-15T10:30:00.000Z"
  },
  "chapters": [
    {
      "index": 1,
      "id": "chapter-1",
      "title": "Chapter 1: The Beginning", 
      "url": "https://mtlbooks.com/novel/example/chapter-1",
      "filename": "0001-chapter-1.md",
      "completed": true
    }
  ],
  "metadata": {
    "crawlerVersion": "1.0.0",
    "statistics": {
      "totalChapters": 150,
      "completedChapters": 150,  
      "failedChapters": 0
    }
  }
}
```

## 🔧 Advanced Usage

### Resuming Downloads

The crawler automatically saves progress and can resume interrupted downloads:

```bash
# Start download
node src/index.js -u "https://mtlbooks.com/novel/example"

# If interrupted, resume from where it left off
node src/index.js -u "https://mtlbooks.com/novel/example" 

# Force restart from beginning
node src/index.js -u "https://mtlbooks.com/novel/example" --no-resume --force
```

### Batch Processing

```bash
# Download multiple novels
for url in "https://mtlbooks.com/novel/novel1" "https://mtlbooks.com/novel/novel2"; do
  node src/index.js -u "$url" --epub
done
```

### Performance Tuning

```bash
# High performance (use with caution)
node src/index.js -u "..." -c 6 -d "800-1200" 

# Conservative (respectful)
node src/index.js -u "..." -c 1 -d "3000-5000"
```

## 🏗️ Architecture

### Core Components

- **`adapters/`** - Site-specific extraction logic
  - `siteAdapter.js` - Base interface
  - `mtlbooks.js` - MTLBooks implementation
- **`core/`** - Core functionality
  - `browser.js` - Puppeteer management with stealth
  - `scrape.js` - Main scraping orchestrator
  - `output.js` - Output generation (JSON, EPUB)
  - `utils.js` - Utilities and helpers

### Adapter Pattern

The crawler uses an adapter pattern to support multiple sites. To add support for a new site:

1. Create a new adapter class extending `SiteAdapter`
2. Implement required methods: `canHandle()`, `extractMetadata()`, `extractChapterList()`, `extractChapterContent()`
3. Register the adapter in the scraper

## 🛡️ Operational Features

### Rate Limiting & Politeness

- Configurable delays between requests
- Respects `robots.txt` by default
- Conservative default settings
- Honors `Retry-After` headers

### Error Handling

- Automatic retries with exponential backoff
- Individual chapter failures don't stop entire process
- Detailed error logging and reporting
- Graceful handling of network issues

### Resource Management

- Browser process cleanup on exit
- Memory usage monitoring
- Connection pooling and reuse
- Automatic garbage collection triggers

## 🐛 Troubleshooting

### Common Issues

1. **"No adapter found"** - Verify the URL is from MTLBooks.com
2. **"Content container not found"** - Site structure may have changed
3. **Browser fails to start** - Install required dependencies for Puppeteer
4. **High memory usage** - Reduce concurrency or add delays

### Debug Mode

```bash
# Enable debug logging
node src/index.js -u "..." --log-level debug

# Run browser in non-headless mode
node src/index.js -u "..." --headless false
```

### Performance Issues

- Reduce `--concurrency` to 1-2
- Increase `--delay` to 2000-4000ms  
- Use `--timeout` for slow networks
- Monitor memory usage in debug mode

## 📋 Requirements

- **Node.js**: >=18.0.0
- **Memory**: 1GB+ recommended
- **Storage**: Varies by novel size
- **Network**: Stable internet connection

### System Dependencies

Puppeteer may require additional system packages:

```bash
# Ubuntu/Debian
sudo apt-get install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget

# CentOS/RHEL/Fedora  
sudo yum install -y alsa-lib.x86_64 atk.x86_64 cups-libs.x86_64 gtk3.x86_64 ipa-gothic-fonts libXcomposite.x86_64 libXcursor.x86_64 libXdamage.x86_64 libXext.x86_64 libXi.x86_64 libXrandr.x86_64 libXScrnSaver.x86_64 libXtst.x86_64 pango.x86_64 xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi xorg-x11-fonts-cyrillic xorg-x11-fonts-misc xorg-x11-fonts-Type1 xorg-x11-utils
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## ⚠️ Legal Notice

This tool is for educational and personal use only. Users are responsible for:

- Respecting website terms of service
- Following copyright laws
- Using reasonable rate limits
- Not overloading target servers

The authors are not responsible for misuse of this tool.


# Install dependencies
npm install

# Download entire novel
node src/index.js --url "https://mtlbooks.com/novel/example-novel"

# Partial download with EPUB
node src/index.js -u "https://mtlbooks.com/novel/example" -r "1-100" --epub

# High performance mode (use carefully)  
node src/index.js -u "..." -c 6 -d "800-1200"

# Debug mode
node src/index.js -u "..." --log-level debug --headless false