import puppeteer, { type Browser, type Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

/**
 * Image Generation Utilities
 *
 * Shared Puppeteer utilities for converting HTML to PNG images.
 * Used by multiple alert scripts that generate table/dashboard visualizations.
 */

export interface ImageGenerationOptions {
  /** Output file path for the generated image */
  outputPath: string;

  /** Viewport width (default: 1200) */
  width?: number;

  /** Viewport height (default: 800) */
  height?: number;

  /** Wait time after page load in ms (default: 1000) */
  waitTime?: number;

  /** CSS selector to wait for before screenshot (optional) */
  waitForSelector?: string;

  /** Device scale factor for high-DPI images (default: 2) */
  deviceScaleFactor?: number;

  /** Background color (default: white) */
  backgroundColor?: string;
}

/**
 * Generate PNG image from HTML string
 */
export async function generateImageFromHTML(
  html: string,
  options: ImageGenerationOptions
): Promise<string> {
  const {
    outputPath,
    width = 1200,
    height = 800,
    waitTime = 1000,
    waitForSelector,
    deviceScaleFactor = 2,
    backgroundColor = '#ffffff',
  } = options;

  let browser: Browser | null = null;

  try {
    // Launch headless browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Set viewport with device scale factor for high-DPI images
    await page.setViewport({
      width,
      height,
      deviceScaleFactor,
    });

    // Set content with base styles
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for specific selector if provided
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    }

    // Additional wait time for dynamic content
    await page.waitForTimeout(waitTime);

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: false,
      omitBackground: backgroundColor === 'transparent',
    });

    console.log(`✓ Image generated: ${outputPath}`);

    return outputPath;
  } catch (error) {
    console.error('❌ Error generating image:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate PNG image from HTML file
 */
export async function generateImageFromHTMLFile(
  htmlFilePath: string,
  outputPath: string,
  options?: Partial<ImageGenerationOptions>
): Promise<string> {
  if (!fs.existsSync(htmlFilePath)) {
    throw new Error(`HTML file not found: ${htmlFilePath}`);
  }

  const html = fs.readFileSync(htmlFilePath, 'utf-8');

  return generateImageFromHTML(html, {
    outputPath,
    ...options,
  });
}

/**
 * Common HTML template wrapper for table-based alerts
 */
export function wrapTableHTML(
  title: string,
  tableHTML: string,
  styles?: string
): string {
  const defaultStyles = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      padding: 40px;
      background: #ffffff;
      margin: 0;
    }
    h1 {
      color: #1a1a1a;
      margin-bottom: 24px;
      font-size: 28px;
      font-weight: 600;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    th {
      background: #f8f9fa;
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
      color: #495057;
      border-bottom: 2px solid #dee2e6;
    }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid #e9ecef;
      font-size: 14px;
      color: #212529;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover {
      background-color: #f8f9fa;
    }
    .timestamp {
      color: #6c757d;
      font-size: 12px;
      margin-top: 16px;
    }
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          ${defaultStyles}
          ${styles || ''}
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${tableHTML}
        <div class="timestamp">Generated at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
      </body>
    </html>
  `;
}

/**
 * Clean up generated image file
 */
export function cleanupImage(imagePath: string): void {
  try {
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log(`✓ Cleaned up image: ${imagePath}`);
    }
  } catch (error) {
    console.warn(`⚠️  Failed to cleanup image ${imagePath}:`, error);
  }
}

/**
 * Ensure output directory exists
 */
export function ensureOutputDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
