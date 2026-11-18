// Generate Chrome Web Store assets from the real extension running on the test fixtures.
//   node scripts/store-assets.mjs   →  docs/store/*.png
// Screenshots: 1280×800. Small promo tile: 440×280. Marquee: 1400×560.
//
// 1. Capture the real Deetz panel (transparent corners, 2x) in several states.
// 2. Compose marketing frames: page source in the background, a red scan beam sweeping
//    across it, detection chips pinned to the scanned lines, a headline, and the panel.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'docs/store');
fs.mkdirSync(OUT, { recursive: true });
const FIX = (f) => fs.readFileSync(path.join(ROOT, 'tests/fixtures', f));
const b64 = (buf) => 'data:image/png;base64,' + Buffer.from(buf).toString('base64');

// ── 1. capture panel states ────────────────────────────────────────────────
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'deetz-store-'));
for (const f of ['manifest.json', 'src', 'icons']) fs.cpSync(path.join(ROOT, f), path.join(EXT, f), { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json')));
mf.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(mf));
const panelPath = path.join(EXT, 'src/panel.js');
fs.writeFileSync(panelPath, fs.readFileSync(panelPath, 'utf8').replace("mode: 'closed'", "mode: 'open'"));

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'deetz-store-p-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2,
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
    const html = FIX(host === 'expo.test' ? 'expo.html' : 'wordpress.html').toString().replace(/<script>setTimeout[\s\S]*?<\/script>/, '');
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

async function capture({ host, scheme, size, steps }) {
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  const url = `https://${host}/`;
  await page.goto(url);
  await page.addStyleTag({ content: 'html,body{background:transparent!important}body>*:not(deetz-panel){visibility:hidden!important}' });
  await sw.evaluate(async ([u, size]) => {
    await chrome.storage.local.set({ 'deetz:ui': { pos: { right: 40, bottom: 40 }, size, theme: 'system', tab: 'all' } });
    const [tab] = await chrome.tabs.query({ url: u + '*' });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/rules.js', 'src/detect.js', 'src/panel.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'deetz:toggle' });
  }, [url, size]);
  await page.waitForTimeout(2500);
  const P = (sel) => page.locator('deetz-panel').locator(sel);
  for (const s of steps) { await s(P, page); await page.waitForTimeout(250); }
  const png = await P('.panel').screenshot({ omitBackground: true });
  await page.close();
  return b64(png);
}

const size = { w: 410, h: 660 };
const panels = {
  all: await capture({ host: 'expo.test', scheme: 'dark', size, steps: [async (P) => P('.row[data-id="supabase"]').click()] }),
  plugins: await capture({ host: 'wordpress.test', scheme: 'light', size, steps: [async (P) => P('.trigger[data-tab=plugins]').click(), async (P) => P('.row[data-id="wp:gravityforms"]').click()] }),
  activity: await capture({ host: 'expo.test', scheme: 'dark', size, steps: [
    async (P) => P('.btn[data-act=watch]').click(),
    async (P, page) => { await page.waitForTimeout(500); await page.evaluate(async () => {
      await fetch('https://demo-project.supabase.co/rest/v1/libraries?select=payload');
      await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a', type: 'b', message: 'c' }) });
    }); await page.waitForTimeout(500); },
    async (P) => P('.row[data-id^="act:"]').first().click(),
  ] }),
  search: await capture({ host: 'wordpress.test', scheme: 'light', size, steps: [async (P) => P('.searchbtn').click(), async (P) => P('.input').fill('gform'), async (P) => P('.btn-primary').click()] }),
  page: await capture({ host: 'expo.test', scheme: 'dark', size, steps: [async (P) => P('.trigger[data-tab=page]').click(), async (P) => P('.row[data-id="page:routes"]').click()] }),
};
console.log('captured panel states');

// ── 2. compose frames ──────────────────────────────────────────────────────
const CODE = `<!doctype html>
<html lang="en">
<head>
  <meta name="generator" content="WordPress 7.1.4">
  <link rel="stylesheet" href="https://use.typekit.net/abc1def.css">
  <script src="/wp-content/plugins/gravityforms/js/gravityforms.min.js?ver=3.1.3"></script>
  <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST123"></script>
</head>
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, key)
export default function App() {
  const [games, setGames] = useState([])
  useEffect(() => { supabase.from('libraries').select('payload') }, [])
  return <View style={styles.container}><Calendar games={games} /></View>
}
var x = { bundleType: 0, version: "19.2.3", rendererPackageName: "react-dom" }
self.__next_f = self.__next_f || []; self.__next_f.push([1, "0:[\\"$\\",\\"html\\"]"])
<div class="gform_wrapper gravity-theme" id="gform_wrapper_1">
  <form method="post" id="gform_1" action="/contact/">
async function report(body) { const r = await fetch('/api/report', { method: 'POST', body }) }
class GoTrueClient { #lock = null; static { } }  // ES2022+
server: Vercel  ·  x-vercel-cache: HIT  ·  strict-transport-security: max-age=63072000
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js"></script>
<style id="react-native-stylesheet">.css-view-175oi2r{display:flex}</style>
@font-face { font-family: "Outfit_400Regular"; src: url(/fonts/outfit-400.woff2) }
window.dataLayer = window.dataLayer || []; function gtag(){ dataLayer.push(arguments) }
<link rel="https://api.w.org/" href="https://example.com/wp-json/">
import { motion } from 'framer-motion'; import { z } from 'zod'
const store = create((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }))
<meta name="generator" content="WP Rocket 3.23.5.1" data-wpr-features="wpr_preconnect">
x-powered-by: PHP/8.3.36, PleskLin  ·  cf-ray: a5c0da8bbbe5ce07-MIA  ·  server: cloudflare`;

// Single-pass highlighter: strings, keywords, tag names, comments.
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TOK = /("[^"]*"|'[^']*')|\b(import|from|const|let|var|function|async|await|return|export|default|class|static|new)\b|(<\/?)([a-z][\w-]*)|(\/\/.*$)/g;
const hl = (line) => {
  let out = '', last = 0, m;
  TOK.lastIndex = 0;
  while ((m = TOK.exec(line))) {
    out += esc(line.slice(last, m.index));
    if (m[1]) out += `<i class="s">${esc(m[1])}</i>`;
    else if (m[2]) out += `<i class="k">${m[2]}</i>`;
    else if (m[3]) out += `${esc(m[3])}<i class="t">${m[4]}</i>`;
    else if (m[5]) out += `<i class="c">${esc(m[5])}</i>`;
    last = TOK.lastIndex;
  }
  return out + esc(line.slice(last));
};
const codeHTML = (lines, fontSize) => {
  const all = CODE.split('\n');
  const out = [];
  for (let i = 0; i < lines; i++) out.push(`<div>${hl(all[i % all.length]) || '&nbsp;'}</div>`);
  return `<div class="code" style="font-size:${fontSize}px">${out.join('')}</div>`;
};
const ICON = fs.readFileSync(path.join(ROOT, 'design/icon.svg'), 'utf8').replace(/width="128" height="128"/, 'width="100%" height="100%"');

const BASE_CSS = `
*{box-sizing:border-box;margin:0}
body{position:relative;overflow:hidden;background:#09090b;color:#fafafa;font-family:Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.scrim{position:absolute;inset:0;pointer-events:none}
.glow{position:absolute;inset:0;background:radial-gradient(900px 500px at 12% 0%,rgba(99,102,241,.22),transparent 60%),radial-gradient(700px 500px at 100% 100%,rgba(34,197,94,.10),transparent 60%)}
.code{position:absolute;inset:0;padding:22px 28px;font-family:"JetBrains Mono","DejaVu Sans Mono",ui-monospace,monospace;line-height:1.75;white-space:pre;color:#a1a1aa}
.code i{font-style:normal}.code .k{color:#c084fc}.code .s{color:#86efac}.code .t{color:#7dd3fc}.code .c{color:#71717a}
.dim{opacity:.09}
.lit{opacity:.42;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 70%,#000 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 70%,#000 100%)}
.tint{position:absolute;left:0;right:0;background:linear-gradient(to bottom,rgba(229,72,77,0),rgba(229,72,77,.10))}
.beam{position:absolute;left:-2%;right:-2%;height:3px;border-radius:3px;background:linear-gradient(90deg,rgba(255,92,98,0),#ff5c62 12%,#ff5c62 88%,rgba(255,92,98,0));
  box-shadow:0 0 18px 4px rgba(229,72,77,.65),0 0 60px 14px rgba(229,72,77,.25)}
.beam:after{content:"";position:absolute;left:12%;right:12%;top:1px;height:1px;background:rgba(255,255,255,.7)}
.chip{position:absolute;display:inline-flex;align-items:center;gap:7px;padding:5px 10px 5px 8px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;
  background:rgba(9,9,11,.82);border:1px solid rgba(255,255,255,.12);box-shadow:0 6px 20px rgba(0,0,0,.45);backdrop-filter:blur(6px)}
.chip b{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;background:#22c55e;color:#09090b;font-size:10px}
.chip span{font-family:"JetBrains Mono","DejaVu Sans Mono",monospace;font-weight:500;color:#a1a1aa;font-size:12px}
.mark{display:inline-flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em}
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);
  font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#d4d4d8}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.2)}
h1{font-size:62px;line-height:1.02;letter-spacing:-.035em;font-weight:800}
h1 em{font-style:normal;background:linear-gradient(90deg,#4ade80,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:21px;line-height:1.45;color:#a1a1aa}
.panel{position:absolute;filter:drop-shadow(0 30px 60px rgba(0,0,0,.6)) drop-shadow(0 0 1px rgba(255,255,255,.25))}`;

const scanLayer = ({ w, h, beamY, fontSize, lines }) => `
  <div class="glow"></div>
  <div class="dim">${codeHTML(lines, fontSize)}</div>
  <div class="lit" style="position:absolute;inset:0;clip-path:inset(0 0 ${h - beamY}px 0)">${codeHTML(lines, fontSize)}</div>
  <div class="tint" style="top:${Math.max(0, beamY - 160)}px;height:160px"></div>
  <div class="beam" style="top:${beamY - 1}px"></div>
  <div class="scrim" style="background:radial-gradient(${Math.round(w * 0.55)}px ${Math.round(h * 0.55)}px at 22% 32%,rgba(9,9,11,.92),rgba(9,9,11,.55) 55%,transparent 80%)"></div>`;
const chip = (x, y, name, ver) => `<div class="chip" style="left:${x}px;top:${y}px"><b>✓</b>${name}${ver ? ` <span>${ver}</span>` : ''}</div>`;

const browser = await chromium.launch();
async function frame(w, h, html, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head><style>${BASE_CSS}</style></head><body style="width:${w}px;height:${h}px">${html}</body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, file) });
  await page.close();
  console.log('wrote docs/store/' + file);
}

const SHOTS = [
  { file: 'screenshot-1-all.png', panel: panels.all, eyebrow: 'Deetz for Chrome',
    h1: 'See what any site<br>is <em>built with</em>.', sub: 'CMS, frameworks, plugins, hosting and 950+ more. Every result comes with the evidence.',
    chips: [['Supabase', '2.119.0'], ['React', '19.2.3'], ['Vercel'], ['Expo']] },
  { file: 'screenshot-2-plugins.png', panel: panels.plugins, eyebrow: 'WordPress, Craft & more',
    h1: 'Every plugin.<br><em>Every version.</em>', sub: 'Any WordPress plugin or theme, named or not, straight from its folder.',
    chips: [['Gravity Forms', '3.1.3'], ['WP Rocket', '3.23.5.1'], ['Yoast SEO'], ['WordPress', '7.1.4']] },
  { file: 'screenshot-3-activity.png', panel: panels.activity, eyebrow: 'Watch mode',
    h1: 'Watch the<br>network <em>live</em>.', sub: 'Form submits, API routes and database calls as they happen. Field names only, never values.',
    chips: [['POST /api/report', '200'], ['Supabase table', 'libraries'], ['Vercel Functions']] },
  { file: 'screenshot-4-search.png', panel: panels.search, eyebrow: 'Source search',
    h1: 'Search the<br><em>source</em>.', sub: 'The HTML and every JS and CSS file the page loaded. Case, whole word and regex.',
    chips: [['gform', '5 matches'], ['jQuery', '3.3.1'], ['Adobe Fonts']] },
  { file: 'screenshot-5-page.png', panel: panels.page, eyebrow: 'Page facts',
    h1: 'The whole page,<br><em>at a glance</em>.', sub: 'Requests, code read, API routes, source maps, security headers and metadata.',
    chips: [['ES2022+'], ['Metro bundler'], ['HSTS', '2 yr'], ['5 API routes']] },
];
for (const s of SHOTS) {
  const W = 1280, H = 800, beamY = 548;
  await frame(W, H, `
    ${scanLayer({ w: W, h: H, beamY, fontSize: 15, lines: 32 })}
    <div style="position:absolute;left:72px;top:92px;width:640px;display:grid;gap:24px">
      <div><span class="eyebrow"><i></i>${s.eyebrow}</span></div>
      <h1>${s.h1}</h1>
      <p class="sub">${s.sub}</p>
    </div>
    ${s.chips.map((c, i) => chip(72 + (i % 2) * 250, beamY - 108 + Math.floor(i / 2) * 46 - (i % 2) * 14, c[0], c[1])).join('')}
    <div class="mark" style="position:absolute;left:72px;bottom:56px;font-size:24px"><span style="width:40px;height:40px">${ICON}</span>Deetz</div>
    <img class="panel" src="${s.panel}" style="right:64px;top:${(H - size.h) / 2}px;width:${size.w}px;height:${size.h}px">`, s.file);
}

// Small promo tile 440×280
await frame(440, 280, `
  ${scanLayer({ w: 440, h: 280, beamY: 168, fontSize: 10.5, lines: 18 })}
  <div style="position:absolute;left:30px;top:52px;display:flex;align-items:center;gap:16px">
    <div style="width:86px;height:86px;filter:drop-shadow(0 8px 20px rgba(0,0,0,.5))">${ICON}</div>
    <div><div style="font-size:44px;font-weight:800;letter-spacing:-.035em;line-height:1">Deetz</div>
    <div style="margin-top:6px;font-size:15px;color:#d4d4d8;line-height:1.3">See what any site<br>is built with.</div></div>
  </div>
  <div style="position:absolute;left:30px;bottom:26px;display:flex;gap:6px">
    ${['WordPress', 'Next.js', 'Supabase', 'Vercel'].map((t) => `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)">${t}</span>`).join('')}
  </div>`, 'promo-small-440x280.png');

// Marquee 1400×560
await frame(1400, 560, `
  ${scanLayer({ w: 1400, h: 560, beamY: 330, fontSize: 15, lines: 22 })}
  <div style="position:absolute;left:96px;top:118px;display:flex;align-items:center;gap:36px">
    <div style="width:200px;height:200px;filter:drop-shadow(0 18px 40px rgba(0,0,0,.55))">${ICON}</div>
    <div><div style="font-size:96px;font-weight:800;letter-spacing:-.045em;line-height:1">Deetz</div>
    <div style="margin-top:14px;font-size:30px;color:#d4d4d8">See what any site is <span style="background:linear-gradient(90deg,#4ade80,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700">built with</span>.</div></div>
  </div>
  ${[['WordPress', '7.1.4'], ['Gravity Forms', '3.1.3'], ['React', '19.2.3'], ['Supabase', '2.119.0'], ['Vercel'], ['ES2022+']]
    .map((c, i) => chip(840 + (i % 2) * 230, 150 + Math.floor(i / 2) * 52 + (i % 2) * 18, c[0], c[1])).join('')}
  <div style="position:absolute;left:96px;bottom:52px;font-size:18px;color:#a1a1aa">Evidence for every result · Plugins & versions · Live network activity · Source search</div>`, 'promo-marquee-1400x560.png');

await browser.close();
await ctx.close();
fs.rmSync(EXT, { recursive: true, force: true });
