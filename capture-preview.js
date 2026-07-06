import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set viewport
  await page.setViewport({ width: 740, height: 750 });

  // Load the HTML file
  const htmlPath = path.join(__dirname, '../open-orders-slack-preview.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Take screenshot
  const screenshotPath = path.join(__dirname, '../open-orders-slack-preview.png');
  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  });

  console.log(`Screenshot saved to: ${screenshotPath}`);

  await browser.close();
})();
