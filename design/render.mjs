import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = new URL('../icons', import.meta.url).pathname;
const tpl = fs.readFileSync(new URL('./action.svg.tpl', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./icon.svg.tpl', import.meta.url), 'utf8');
const b = await chromium.launch(); const p = await b.newPage();
async function shot(svg, size, file) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
for (const s of [16, 32]) {
  await shot(tpl.replaceAll('{S}', s).replaceAll('{INK}', '#E3E3E3'), s, `${OUT}/action-on-dark-${s}.png`);
  await shot(tpl.replaceAll('{S}', s).replaceAll('{INK}', '#474747'), s, `${OUT}/action-on-light-${s}.png`);
}
const padded = app.replace('viewBox="0 0 128 128"', 'viewBox="-21.333 -21.333 170.667 170.667"');
for (const s of [16, 32, 48]) await shot(app.replaceAll('SIZE', s), s, `${OUT}/icon-${s}.png`);
await shot(padded.replaceAll('SIZE', 128), 128, `${OUT}/icon-128.png`);
await b.close();
