import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const mode = process.argv[2] || 'preview';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--hide-scrollbars', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('file://' + process.cwd() + '/cue-launch.html', { waitUntil: 'networkidle0' });
await page.evaluate(async () => { await document.fonts.ready; });
const fontsOk = await page.evaluate(() => ['Instrument Serif', 'Inter', 'JetBrains Mono'].map(f => document.fonts.check(`20px "${f}"`)));
console.log('fonts', fontsOk);
const el = await page.$('#stage');
if (mode === 'preview') {
  mkdirSync('preview', { recursive: true });
  for (const t of process.argv.slice(3).map(Number)) {
    await page.evaluate(t => window.seek(t), t);
    await el.screenshot({ path: `preview/t${t.toFixed(2)}.jpg`, type: 'jpeg', quality: 85 });
  }
} else {
  mkdirSync('frames_out', { recursive: true });
  const N = Number(process.argv[3]);
  for (let i = 0; i < N; i++) {
    await page.evaluate(t => window.seek(t), i / 30);
    await el.screenshot({ path: `frames_out/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 });
  }
}
await browser.close();
