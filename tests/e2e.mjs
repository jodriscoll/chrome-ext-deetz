// Deetz end-to-end tests.
// Loads the unpacked extension into Chromium, serves fixture sites offline, runs real scans,
// and checks what Deetz detects plus the panel's late-load and Activity behavior.
//
//   npm install && npx playwright install chromium && npm test
//
// Exit code 0 = all checks passed.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FIX = (f) => fs.readFileSync(path.join(ROOT, 'tests/fixtures', f));

// Test copy of the extension: host access (so we can trigger it without a toolbar click)
// and an open shadow root (so the test can look inside the panel).
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'deetz-ext-'));
for (const f of ['manifest.json', 'src', 'icons']) fs.cpSync(path.join(ROOT, f), path.join(EXT, f), { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json')));
mf.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(mf));
const panelPath = path.join(EXT, 'src/panel.js');
fs.writeFileSync(panelPath, fs.readFileSync(panelPath, 'utf8').replace("mode: 'closed'", "mode: 'open'"));

const SITES = {
  'wordpress.test': {
    html: FIX('wordpress.html'),
    headers: { server: 'cloudflare', 'cf-ray': 'abc-MIA', 'x-powered-by': 'PHP/8.3.36, PleskLin', 'strict-transport-security': 'max-age=7776000', link: '<https://wordpress.test/wp-json/>; rel="https://api.w.org/"' },
  },
  'nextjs.test': {
    html: FIX('nextjs.html'),
    headers: { server: 'Vercel', 'x-vercel-id': 'iad1::abc', 'x-vercel-cache': 'HIT', 'x-nextjs-prerender': '1' },
  },
  'craft.test': {
    html: FIX('craft.html'),
    headers: { 'x-powered-by': 'Craft CMS', server: 'nginx/1.25.3' },
  },
  'expo.test': {
    html: FIX('expo.html'),
    headers: { server: 'Vercel', 'x-vercel-id': 'iad1::v28l9', 'x-vercel-cache': 'HIT', 'strict-transport-security': 'max-age=63072000' },
  },
};

// ── expectations ───────────────────────────────────────────────────────────
// [name, version?]. A version of null means "detected, version not checked".
const EXPECT = {
  'wordpress.test': {
    has: [['WordPress', '7.1.4'], ['Gravity Forms', '3.1.3'], ['WP Rocket', '3.23.5.1'], ['Yoast SEO'], ['EWWW Image Optimizer'],
      ['Acme Co', '2.4.0'], ['jQuery', '3.3.1'], ['Slick', '1.0.1'], ['LazySizes'], ['PHP', '8.3.36'], ['Cloudflare'], ['Plesk'],
      ['Google Tag Manager'], ['Google Analytics'], ['reCAPTCHA'], ['Adobe Fonts'], ['Cloudflare Email Obfuscation'], ['HSTS']],
    tags: [['Google Tag Manager', 'GTM-TEST123'], ['EWWW Image Optimizer', 'must-use']],
    via: [['jQuery', 'ajax.googleapis.com'], ['LazySizes', 'EWWW Image Optimizer']],
    // WordPress appends its own ?ver=7.1.4 to these; Deetz must not report it as their version.
    notVersion: [['reCAPTCHA', '7.1.4'], ['Slick', '7.1.4']],
  },
  'nextjs.test': {
    has: [['Next.js', '15.1.0'], ['React'], ['Vercel'], ['Sanity'], ['Tailwind CSS'], ['Vercel Web Analytics']],
    tags: [['Next.js', 'App Router']],
  },
  'craft.test': {
    has: [['Craft CMS'], ['Formie'], ['Blitz'], ['Alpine.js', '3.14.1'], ['htmx', '2.0.3'], ['Nginx', '1.25.3']],
  },
  'expo.test': {
    has: [['Supabase', '2.119.0'], ['React', '19.2.3'], ['Expo'], ['React Native Web'], ['Reanimated'], ['expo-image'],
      ['AsyncStorage'], ['Vercel'], ['Vercel Functions'], ['Vercel BotID'], ['Metro bundler'], ['JavaScript'], ['HSTS']],
    labels: [['JavaScript', 'ES2022+']],
  },
};

// ── harness ───────────────────────────────────────────────────────────────
let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; } else { failed++; console.log('  ✗ ' + msg); } };

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'deetz-profile-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('**/*', (route) => {
  const u = new URL(route.request().url());
  const site = SITES[u.hostname.replace(/^www\./, '')];
  if (site && u.pathname === '/') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html', ...site.headers }, body: site.html });
  if (/\/wp-content\/themes\/acme-theme\/style\.css/.test(u.pathname))
    return route.fulfill({ status: 200, contentType: 'text/css', body: '/*\nTheme Name: Acme Co\nAuthor: Acme Studio\nVersion: 2.4.0\n*/' });
  if (u.pathname.includes('__common')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FIX('expo-bundle.js') });
  if (/jquery\.min\.js/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/*! jQuery v3.3.1 | (c) JS Foundation */' });
  const cors = { 'access-control-allow-origin': '*' };
  if (/\.css$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* */', headers: cors });
  if (/\.js$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '', headers: cors });
  if (/^\/api\//.test(u.pathname) || /\.json$/.test(u.pathname) || u.hostname.endsWith('supabase.co'))
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: cors });
  return route.fulfill({ status: 200, body: '' });
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');

// Same steps as the toolbar click handler in background.js.
const openPanel = (url) => sw.evaluate(async (u) => {
  const [tab] = await chrome.tabs.query({ url: u + '*' });
  const [probe] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => !!window.__deetz });
  if (!probe.result) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/rules.js', 'src/detect.js', 'src/panel.js'] });
  await chrome.tabs.sendMessage(tab.id, { type: 'deetz:toggle' });
}, url);

const scan = (url) => sw.evaluate(async (u) => {
  const [tab] = await chrome.tabs.query({ url: u + '*' });
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      const res = await chrome.runtime.sendMessage({ type: 'deetz:globals', paths: DeetzDetect.jsPaths() });
      const s = await DeetzDetect.scan({ globals: res.globals });
      return s.items.map((i) => ({ name: i.name, version: i.version, label: i.label, tags: i.tags, via: i.via }));
    },
  });
  return r.result;
}, url);

for (const host of Object.keys(SITES)) {
  const url = `https://${host === 'expo.test' ? 'www.' : ''}${host}/`;
  console.log(`\n${host}`);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!/__d is not defined/.test(String(e))) errors.push(String(e)); });
  await page.goto(url);
  await page.waitForTimeout(400);
  await openPanel(url);
  await page.waitForTimeout(2500);

  const P = (sel) => page.locator('deetz-panel').locator(sel);
  ok(await P('.panel').isVisible(), 'panel is visible');
  ok((await P('.trigger').count()) >= 3, 'tabs render');

  if (host === 'expo.test') {
    // GTM + GA are injected ~3.5 s after load: the panel must pick them up on its own.
    await page.waitForTimeout(6000);
    const names = await page.locator('deetz-panel').evaluate((h) => [...h.shadowRoot.querySelectorAll('.row .nm')].map((r) => r.textContent));
    ok(names.includes('Google Tag Manager'), 'late-loaded Google Tag Manager detected without a manual rescan');
    ok(names.includes('Google Analytics'), 'late-loaded Google Analytics detected without a manual rescan');
    // Watch + Activity: a POST with a JSON body is logged with field names only.
    await P('.btn[data-act=watch]').click();
    await page.waitForTimeout(600);
    await page.evaluate(() => fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@y.z', message: 'secret value' }) }));
    await page.waitForTimeout(600);
    const act = await page.locator('deetz-panel').evaluate((h) => h.shadowRoot.querySelector('.body').innerText);
    ok(/POST/.test(act) && /\/api\/report/.test(act), 'Activity logs POST /api/report');
    await P('.row[data-id^="act:"]').first().click();
    const detail = await page.locator('deetz-panel').evaluate((h) => h.shadowRoot.querySelector('.body').innerText);
    ok(/email, message/.test(detail), 'Activity shows field names');
    ok(!/secret value/.test(detail), 'Activity never shows field values');
  }

  const items = await scan(url);
  const find = (n) => items.find((i) => i.name === n);
  const exp = EXPECT[host];
  for (const [name, version] of exp.has) {
    const it = find(name);
    ok(it, `detects ${name}`);
    if (it && version) ok(it.version === version, `${name} version ${version} (got ${it.version})`);
  }
  for (const [name, tag] of exp.tags || []) ok(find(name)?.tags.includes(tag), `${name} tagged "${tag}"`);
  for (const [name, via] of exp.via || []) ok(find(name)?.via.includes(via), `${name} via ${via}`);
  for (const [name, label] of exp.labels || []) ok(find(name)?.label === label, `${name} labeled ${label}`);
  for (const [name, bad] of exp.notVersion || []) ok(find(name)?.version !== bad, `${name} does not inherit WordPress's ?ver=${bad}`);
  ok(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`  ${items.length} technologies detected`);
  await page.close();
}

await ctx.close();
fs.rmSync(EXT, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
