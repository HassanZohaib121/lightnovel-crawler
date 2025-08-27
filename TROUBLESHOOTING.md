# Troubleshooting Guide

## Browser/Puppeteer Issues

### Error: "An executablePath or channel must be specified for puppeteer-core"

This happens when the Chrome browser binary is not found. Try these solutions:

**Solution 1: Install full Puppeteer**
```bash
npm uninstall puppeteer-core puppeteer-extra
npm install puppeteer puppeteer-extra
```

**Solution 2: Download Chrome manually**
```bash
npx puppeteer browsers install chrome
```

**Solution 3: Use system Chrome (Linux)**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# CentOS/RHEL
sudo yum install -y google-chrome-stable
```

**Solution 4: Specify Chrome path manually**
Add to your environment or update the browser.js file:
```bash
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome-stable"
```

### Browser Launch Errors on Windows

If you get errors about missing DLLs or Chrome not starting:

1. **Install Visual C++ Redistributables**
   - Download from Microsoft's website
   - Install both x86 and x64 versions

2. **Use Windows Subsystem for Linux (WSL)**
   ```bash
   # In WSL
   sudo apt-get update
   sudo apt-get install -y google-chrome-stable
   ```

3. **Run with different flags**
   ```bash
   node src/index.js --url "..." --headless true
   ```

### Browser Launch Errors on Linux

**Missing dependencies:**
```bash
# Ubuntu/Debian
sudo apt-get install -y \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
    libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
    libxtst6 ca-certificates fonts-liberation libappindicator1 \
    libnss3 lsb-release xdg-utils wget

# CentOS/RHEL/Fedora
sudo yum install -y \
    alsa-lib.x86_64 atk.x86_64 cups-libs.x86_64 gtk3.x86_64 \
    ipa-gothic-fonts libXcomposite.x86_64 libXcursor.x86_64 \
    libXdamage.x86_64 libXext.x86_64 libXi.x86_64 libXrandr.x86_64 \
    libXScrnSaver.x86_64 libXtst.x86_64 pango.x86_64 \
    xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi xorg-x11-fonts-cyrillic \
    xorg-x11-fonts-misc xorg-x11-fonts-Type1 xorg-x11-utils
```

**Sandbox issues:**
```bash
# Add more flags to browser args
node src/index.js --url "..." 
# Or set environment variable
export PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"
```

## Network/Scraping Issues

### "No adapter found for URL"
- Verify the URL is from mtlbooks.com
- Check URL format: `https://mtlbooks.com/novel/novel-name`

### "Content container not found"
- Site structure may have changed
- Try with `--log-level debug` to see what's happening
- Use `--headless false` to see the page visually

### High failure rate
1. **Reduce concurrency:**
   ```bash
   node src/index.js --url "..." --concurrency 1
   ```

2. **Increase delays:**
   ```bash
   node src/index.js --url "..." --delay "3000-5000"
   ```

3. **Check internet connection stability**

### "Navigation timeout"
- Increase timeout: `--timeout 60000`
- Check if site is accessible manually
- Try different times of day (server load)

## Memory Issues

### "Out of memory" errors
1. **Reduce concurrency:**
   ```bash
   node src/index.js --url "..." --concurrency 1
   ```

2. **Increase Node.js memory:**
   ```bash
   node --max-old-space-size=4096 src/index.js --url "..."
   ```

3. **Process chapters in batches:**
   ```bash
   # First 50 chapters
   node src/index.js --url "..." --range "1-50"
   # Next 50 chapters  
   node src/index.js --url "..." --range "51-100"
   ```

## File System Issues

### Permission errors
```bash
# Linux/macOS
sudo chown -R $USER:$USER downloads/
chmod -R 755 downloads/

# Windows (run as Administrator)
takeown /f downloads /r
```

### Invalid filename errors
- The crawler automatically sanitizes filenames
- If issues persist, check for very long chapter titles
- Manually rename problematic files

### Disk space
- Monitor available space: `df -h` (Linux/macOS) or `dir` (Windows)
- Large novels can be several GB
- Enable cleanup of temp files

## Performance Optimization

### Slow scraping
1. **Optimize browser settings:**
   ```bash
   # Disable images and CSS
   node src/index.js --url "..." --block-resources "image,stylesheet,font"
   ```

2. **Increase concurrency carefully:**
   ```bash
   node src/index.js --url "..." --concurrency 3 --delay "2000-3000"
   ```

3. **Use faster storage (SSD vs HDD)**

### High CPU usage
- Reduce concurrency to 1-2
- Increase delays between requests
- Close other applications

## Debug Mode

Enable detailed logging:
```bash
node src/index.js --url "..." --log-level debug --headless false
```

This will:
- Show detailed browser actions
- Display page content extraction steps
- Help identify where failures occur
- Allow visual inspection of pages

## Getting Help

If none of these solutions work:

1. **Check the logs** in debug mode
2. **Test with a simple novel** (fewer chapters)
3. **Try different times of day**
4. **Check mtlbooks.com accessibility** in your browser
5. **Update dependencies:** `npm update`

## Common Environment Issues

### Node.js Version
```bash
node --version  # Should be 18+ 
npm --version   # Should be 8+
```

### npm/Package Issues
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables
Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your settings
```