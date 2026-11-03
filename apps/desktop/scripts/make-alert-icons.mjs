// Draws tray-alert.png and tray-alert@2x.png: the tray icons with an amber dot, shown while a session needs the user.
// Run with `node scripts/make-alert-icons.mjs`. It needs Playwright, to draw with a real browser. The results are committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const icons = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['tray', 32], ['tray@2x', 64]]) {
  const src = `data:image/png;base64,${readFileSync(join(icons, `${name}.png`)).toString('base64')}`;
  const dataUrl = await page.evaluate(
    async ({ src, size }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const g = canvas.getContext('2d');
      g.drawImage(img, 0, 0, size, size);
      const r = size * 0.2;
      const cx = size - r - size * 0.04;
      const cy = r + size * 0.04;
      g.beginPath();
      g.arc(cx, cy, r + size * 0.05, 0, Math.PI * 2);
      g.fillStyle = '#141413';
      g.fill();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = '#FFC83D';
      g.fill();
      return canvas.toDataURL('image/png');
    },
    { src, size },
  );
  writeFileSync(join(icons, `${name.replace('tray', 'tray-alert')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await browser.close();
console.log('Wrote the alert tray icons.');
