#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import chalk from 'chalk';

console.log(chalk.blue.bold('🚀 MTLBooks Crawler Setup\n'));

try {
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 18) {
    console.error(chalk.red(`❌ Node.js ${nodeVersion} is not supported. Please upgrade to Node.js 18 or higher.`));
    process.exit(1);
  }
  
  console.log(chalk.green(`✅ Node.js ${nodeVersion} is supported`));
  
  // Install dependencies
  console.log(chalk.yellow('📦 Installing dependencies...'));
  execSync('npm install', { stdio: 'inherit' });
  
  // Install Puppeteer Chrome (if needed)
  console.log(chalk.yellow('🌐 Setting up Puppeteer browser...'));
  try {
    execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
  } catch (error) {
    console.warn(chalk.yellow('⚠️  Puppeteer browser install failed, but may still work with system Chrome'));
  }
  
  // Create downloads directory
  if (!fs.existsSync('downloads')) {
    fs.mkdirSync('downloads', { recursive: true });
    console.log(chalk.green('📁 Created downloads directory'));
  }
  
  // Copy environment file
  if (!fs.existsSync('.env') && fs.existsSync('.env.example')) {
    fs.copyFileSync('.env.example', '.env');
    console.log(chalk.green('📄 Created .env file from template'));
  }
  
  console.log(chalk.green.bold('\n✅ Setup completed successfully!\n'));
  console.log(chalk.cyan('Test the crawler with:'));
  console.log(chalk.white('  node src/index.js --url "https://mtlbooks.com/novel/example-novel"\n'));
  
} catch (error) {
  console.error(chalk.red.bold('❌ Setup failed:'));
  console.error(chalk.red(error.message));
  console.error(chalk.yellow('\nTry running:'));
  console.error(chalk.white('  npm install puppeteer'));
  process.exit(1);
}