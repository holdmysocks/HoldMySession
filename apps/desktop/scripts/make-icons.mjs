// Draws the HoldMySession icon (HM in white, S in the Claude orange, on the dark app colour) at every size the
// desktop app needs, and writes icon.png, icon.ico, icon.icns and the tray icons into icons/.
// Run it with `npm run icons`. The results are committed, so building the app does not need to.

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import png2icons from 'png2icons';

// Playwright draws the icon with a real browser. It is not a dependency of the app: install it, or have it on NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'icons');
mkdirSync(out, { recursive: true });

const BACKGROUND = '#141413';
const WHITE = '#faf9f5';
const ORANGE = '#d97757';

/** The icon as SVG. `radius` is the corner radius as a fraction of the size. */
export function iconSvg(size, { radius = 0.22, glyph = 0.33 } = {}) {
  const fontSize = size * glyph;
  const y = size * 0.5 + fontSize * 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${BACKGROUND}"/>
  <text x="${size / 2}" y="${y}" text-anchor="middle" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
        font-weight="800" font-size="${fontSize}" letter-spacing="${-fontSize * 0.04}"><tspan fill="${WHITE}">HM</tspan><tspan fill="${ORANGE}">S</tspan></text>
</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, options) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${iconSvg(size, options)}`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const png = {};
for (const size of sizes) png[size] = await render(size);

writeFileSync(join(out, 'icon.png'), png[1024]);
writeFileSync(join(out, 'icon-256.png'), png[256]);
writeFileSync(join(out, 'icon.ico'), await pngToIco([png[16], png[24], png[32], png[48], png[64], png[128], png[256]]));
const icns = png2icons.createICNS(png[1024], png2icons.BICUBIC, 0);
if (!icns) throw new Error('Could not make icon.icns');
writeFileSync(join(out, 'icon.icns'), icns);

// The tray icon is drawn bigger in its square, with less rounding, so it is still readable at 16 to 32 pixels.
writeFileSync(join(out, 'tray.png'), await render(32, { radius: 0.18, glyph: 0.4 }));
writeFileSync(join(out, 'tray@2x.png'), await render(64, { radius: 0.18, glyph: 0.4 }));
writeFileSync(join(out, 'icon.svg'), iconSvg(512));

await browser.close();
console.log('Wrote', out);
