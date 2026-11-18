// Generate Chrome Web Store assets from the real extension running on the test fixtures.
//   node scripts/store-assets.mjs   →  docs/store/*.png
// Screenshots: 1280×800. Small promo tile: 440×280. Marquee: 1400×560.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'docs/store');
fs.mkdirSync(OUT, { recursive: true });
const FIX = (f) => fs.readFileSync(path.join(ROOT, 'tests/fixtures', f));

const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'deetz-store-'));
for (const f of ['manifest.json', 'src', 'icons']) fs.cpSync(path.join(ROOT, f), path.join(EXT, f), { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json')));
mf.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(mf));
const panelPath = path.join(EXT, 'src/panel.js');
fs.writeFileSync(panelPath, fs.readFileSync(panelPath, 'utf8').replace("mode: 'closed'", "mode: 'open'"));

// A believable page behind the panel.
const SITE_CSS = (dark) => `
  html,body{margin:0;min-height:100%;font:16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;
    background:${dark ? 'radial-gradient(1200px 600px at 20% -10%,#3b2a7a,transparent),linear-gradient(#0d0b1f,#120f2b)' : 'linear-gradient(#fbfaf7,#f1ede4)'};color:${dark ? '#ecebff' : '#1d1b16'}}
  #deetz-demo,#deetz-demo *{font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif!important}
  #deetz-demo{max-width:620px;padding:96px 0 0 72px}
  #deetz-demo .nav{display:flex;gap:28px;font-size:14px;opacity:.7;margin-bottom:96px}
  #deetz-demo h1{font-size:56px;line-height:1.05;letter-spacing:-.03em;margin:0 0 20px}
  #deetz-demo p{font-size:19px;opacity:.75;margin:0 0 32px}
  #deetz-demo .cta{display:inline-block;padding:14px 22px;border-radius:12px;font-weight:600;background:${dark ? '#8b5cf6' : '#1d1b16'};color:#fff}
  #deetz-demo .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:72px}
  #deetz-demo .cards div{height:120px;border-radius:16px;background:${dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'}}`;
const SITE_HTML = (title, lede) => `<div id="deetz-demo"><div class="nav"><b>${title}</b><span>Products</span><span>Journal</span><span>About</span><span>Contact</span></div>
  <h1>${lede}</h1><p>A demo site for Deetz screenshots. Open the panel to see what it's built with.</p><span class="cta">Get started</span><div class="cards"><div></div><div></div><div></div></div></div>`;

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'deetz-store-p-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const HEADERS = {
  'wordpress.test': { server: 'cloudflare', 'cf-ray': 'abc-MIA', 'x-powered-by': 'PHP/8.3.36, PleskLin', 'strict-transport-security': 'max-age=7776000' },
  'expo.test': { server: 'Vercel', 'x-vercel-id': 'iad1::v28l9', 'x-vercel-cache': 'HIT', 'strict-transport-security': 'max-age=63072000' },
};
await ctx.route('**/*', (route) => {
  const u = new URL(route.request().url());
  const host = u.hostname.replace(/^www\./, '');
  if (u.pathname === '/' && HEADERS[host]) {
    const html = FIX(host === 'expo.test' ? 'expo.html' : 'wordpress.html').toString()
      .replace(/<script>setTimeout[\s\S]*?<\/script>/, ''); // no late GTM in screenshots
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/html', ...HEADERS[host] }, body: html });
  }
  if (/\/themes\/acme-theme\/style\.css/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/*\nTheme Name: Acme Co\nAuthor: Acme Studio\nVersion: 2.4.0\n*/' });
  if (u.pathname.includes('__common')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FIX('expo-bundle.js') });
  if (/jquery\.min\.js/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/*! jQuery v3.3.1 */' });
  const cors = { 'access-control-allow-origin': '*' };
  if (/\.css$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '', headers: cors });
  if (/\.js$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '', headers: cors });
  if (/^\/api\//.test(u.pathname) || /\.json$/.test(u.pathname) || u.hostname.endsWith('supabase.co'))
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: cors });
  return route.fulfill({ status: 200, body: '' });
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');

async function shot({ host, scheme, title, lede, file, steps }) {
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  const url = `https://${host}/`;
  await page.goto(url);
  await page.addStyleTag({ content: SITE_CSS(scheme === 'dark') + '#root,main,body>h1,body>b,body>i,form{display:none!important}' });
  await page.evaluate((h) => document.body.insertAdjacentHTML('afterbegin', h), SITE_HTML(title, lede));
  await page.waitForTimeout(300);
  await sw.evaluate(async (u) => {
    await chrome.storage.local.set({ 'deetz:ui': { pos: { right: 40, bottom: 40 }, size: { w: 420, h: 720 }, theme: 'system', tab: 'all' } });
    const [tab] = await chrome.tabs.query({ url: u + '*' });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/rules.js', 'src/detect.js', 'src/panel.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'deetz:toggle' });
  }, url);
  await page.waitForTimeout(2500);
  const P = (sel) => page.locator('deetz-panel').locator(sel);
  for (const s of steps) { await s(P, page); await page.waitForTimeout(250); }
  await page.screenshot({ path: path.join(OUT, file) });
  await page.close();
  console.log('wrote docs/store/' + file);
}

await shot({ host: 'expo.test', scheme: 'dark', title: 'Expo Demo', lede: 'Ship faster with a modern stack.', file: 'screenshot-1-all.png',
  steps: [async (P) => P('.row[data-id="supabase"]').click()] });
await shot({ host: 'wordpress.test', scheme: 'light', title: 'Acme Co', lede: 'Coffee, roasted with care.', file: 'screenshot-2-plugins.png',
  steps: [async (P) => P('.trigger[data-tab=plugins]').click(), async (P) => P('.row[data-id="wp:gravityforms"]').click()] });
await shot({ host: 'expo.test', scheme: 'dark', title: 'Expo Demo', lede: 'Ship faster with a modern stack.', file: 'screenshot-3-activity.png',
  steps: [
    async (P) => P('.btn[data-act=watch]').click(),
    async (P, page) => { await page.waitForTimeout(500); await page.evaluate(async () => {
      await fetch('https://demo-project.supabase.co/rest/v1/libraries?select=payload');
      await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a', type: 'b', message: 'c' }) });
    }); await page.waitForTimeout(500); },
    async (P) => P('.row[data-id^="act:"]').first().click(),
  ] });
await shot({ host: 'wordpress.test', scheme: 'light', title: 'Acme Co', lede: 'Coffee, roasted with care.', file: 'screenshot-4-search.png',
  steps: [async (P) => P('.searchbtn').click(), async (P) => P('.input').fill('gform'), async (P) => P('.btn-primary').click()] });
await shot({ host: 'expo.test', scheme: 'light', title: 'Expo Demo', lede: 'Ship faster with a modern stack.', file: 'screenshot-5-page.png',
  steps: [async (P) => P('.trigger[data-tab=page]').click(), async (P) => P('.row[data-id="page:routes"]').click()] });

// Promo tiles from the SVG master.
const icon = fs.readFileSync(path.join(ROOT, 'design/icon.svg'), 'utf8').replace(/width="128" height="128"/, 'width="100%" height="100%"');
const tile = async (w, h, file, big) => {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;gap:${big ? 48 : 24}px;padding:0 ${big ? 110 : 36}px;box-sizing:border-box;
    font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#fafafa;background:radial-gradient(${w}px ${h}px at 15% 0%,#262626,#0a0a0a)">
    <div style="width:${big ? 220 : 120}px;height:${big ? 220 : 120}px;flex:none">${icon}</div>
    <div><div style="font-size:${big ? 84 : 46}px;font-weight:700;letter-spacing:-.03em;line-height:1">Deetz</div>
    <div style="margin-top:${big ? 18 : 10}px;font-size:${big ? 30 : 17}px;line-height:1.3;color:#a3a3a3">See what any site<br>is built with.</div></div></body>`);
  await page.screenshot({ path: path.join(OUT, file) });
  await page.close();
  console.log('wrote docs/store/' + file);
};
await tile(440, 280, 'promo-small-440x280.png', false);
await tile(1400, 560, 'promo-marquee-1400x560.png', true);

await ctx.close();
fs.rmSync(EXT, { recursive: true, force: true });
