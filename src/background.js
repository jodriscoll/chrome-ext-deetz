/* Deetz: service worker.
 * Injects the panel when the toolbar icon (or Alt+Shift+D) is pressed, and
 * reads JavaScript globals from the page's own world on request.
 * Permissions: activeTab + scripting only, so Chrome shows no "read and change
 * all your data" warning. Access lasts until the tab navigates away. */

const FILES = ['src/rules.js', 'src/detect.js', 'src/panel.js'];

// shadcn/ui default Badge: --primary background, --primary-foreground text.
const BADGE = { dark: ['#E5E5E5', '#171717'], light: ['#171717', '#FAFAFA'] };
function styleBadge(s = 'dark') {
  const [bg, fg] = BADGE[s] || BADGE.dark;
  chrome.action.setBadgeBackgroundColor({ color: bg });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: fg });
}
styleBadge();
chrome.runtime.onInstalled.addListener(() => styleBadge(scheme || 'dark'));

/* Toolbar icon follows Chrome's light/dark mode like the built-in Material icons.
 * Service workers can't read prefers-color-scheme, so the panel reports it and we remember it. */
const ACTION_ICONS = {
  dark: { 16: '/icons/action-on-dark-16.png', 32: '/icons/action-on-dark-32.png' },
  light: { 16: '/icons/action-on-light-16.png', 32: '/icons/action-on-light-32.png' },
};
let scheme = null;
function applyScheme(s) {
  if (!ACTION_ICONS[s] || s === scheme) return;
  scheme = s;
  styleBadge(s);
  chrome.action.setIcon({ path: ACTION_ICONS[s] }).catch((e) => console.warn('[Deetz] setIcon', e));
}
chrome.storage.local.get('deetz:scheme').then((o) => applyScheme(o['deetz:scheme'] || 'dark'));

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!window.__deetz,
    });
    if (!probe || !probe.result) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
    }
    await chrome.tabs.sendMessage(tab.id, { type: 'deetz:toggle' });
  } catch (err) {
    // Chrome blocks extensions on chrome:// pages and the Web Store. No badge; just say so on hover.
    chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    chrome.action.setTitle({ tabId: tab.id, title: "No Deetz here. Chrome doesn't let extensions scan its own pages." });
  }
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setIcon({ tabId, path: ACTION_ICONS[scheme || 'dark'] }).catch(() => {});
  }
});

/* Count badge drawn into the toolbar icon itself, so we control its position and style
 * (Chrome's own badge can't be moved and spreads left as the number gets wider).
 * shadcn Badge look: rounded pill, primary colors, sitting flush in the bottom-right corner. */
const bitmaps = new Map();
async function iconBitmap(path) {
  if (!bitmaps.has(path)) {
    bitmaps.set(path, fetch(chrome.runtime.getURL(path)).then((r) => r.blob()).then((b) => createImageBitmap(b)));
  }
  return bitmaps.get(path);
}
async function drawCountIcon(tabId, count) {
  const s = scheme || 'dark';
  const [bg, fg] = BADGE[s];
  const imageData = {};
  for (const size of [16, 32]) {
    const k = size / 16;
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d');
    g.drawImage(await iconBitmap(ACTION_ICONS[s][size].replace(/^\//, '')), 0, 0, size, size);
    const text = count > 99 ? '99' : String(count);
    g.font = `700 ${6.5 * k}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const h = 8 * k;
    const w = Math.max(h, Math.ceil(g.measureText(text).width) + 3 * k);
    const x = size - w, y = size - h, r = h / 2;
    // knock out a 1px ring so the pill reads against the glyph
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.roundRect(x - k, y - k, w + 2 * k, h + 2 * k, r + k); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 0.5 * k);
    imageData[size] = g.getImageData(0, 0, size, size);
  }
  await chrome.action.setIcon({ tabId, imageData });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null && msg.type !== 'deetz:scheme') return;

  if (msg.type === 'deetz:globals') {
    chrome.scripting
      .executeScript({
        target: { tabId, frameIds: [sender.frameId || 0] },
        world: 'MAIN',
        func: collectGlobals,
        args: [msg.paths || []],
      })
      .then(([r]) => sendResponse({ ok: true, globals: (r && r.result) || {} }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  }

  if (msg.type === 'deetz:scheme') {
    applyScheme(msg.scheme);
    chrome.storage.local.set({ 'deetz:scheme': msg.scheme });
    return;
  }

  if (msg.type === 'deetz:nethook') {
    chrome.scripting
      .executeScript({ target: { tabId, frameIds: [sender.frameId || 0] }, world: 'MAIN', func: installNetHook })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === 'deetz:badge') {
    chrome.action.setBadgeText({ tabId, text: '' });
    if (msg.count) drawCountIcon(tabId, msg.count).catch(() => chrome.action.setBadgeText({ tabId, text: String(msg.count) }));
    chrome.action.setTitle({ tabId, title: `Deetz: ${msg.count || 0} technologies on this page` });
  }
});

/* Runs in the page's MAIN world while Watch is on. Wraps fetch and XHR so the panel can
 * show method, URL, status and timing. For JSON / form bodies it reports field NAMES only,
 * never values. Events cross to the panel as a JSON string on a DOM CustomEvent. */
function installNetHook() {
  if (window.__deetzNet) return;
  window.__deetzNet = true;
  const keysOf = (body) => {
    try {
      if (!body) return null;
      if (typeof body === 'string') {
        const t = body.trim();
        if (t[0] === '{') return Object.keys(JSON.parse(t)).slice(0, 20);
        if (/^[\w.%-]+=/.test(t)) return [...new URLSearchParams(t).keys()].slice(0, 20);
        return null;
      }
      if (body instanceof FormData || body instanceof URLSearchParams) return [...new Set(body.keys())].slice(0, 20);
    } catch (e) { /* not JSON */ }
    return null;
  };
  const emit = (d) => { try { document.dispatchEvent(new CustomEvent('deetz:net', { detail: JSON.stringify(d) })); } catch (e) { /* ignore */ } };
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      const t0 = performance.now();
      let url = '', method = 'GET', body = null;
      try {
        url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        body = init && init.body;
      } catch (e) { /* ignore */ }
      const p = origFetch.apply(this, arguments);
      p.then((res) => emit({ via: 'fetch', method, url: new URL(url, location.href).href, status: res.status, ms: Math.round(performance.now() - t0), fields: keysOf(body), type: res.headers.get('content-type') }),
        () => emit({ via: 'fetch', method, url: new URL(url, location.href).href, status: 0, ms: Math.round(performance.now() - t0), fields: keysOf(body), error: true }));
      return p;
    };
  }
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__deetz = { method: String(method).toUpperCase(), url: new URL(url, location.href).href }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    const d = this.__deetz, t0 = performance.now();
    if (d) this.addEventListener('loadend', () => emit({ via: 'xhr', method: d.method, url: d.url, status: this.status, ms: Math.round(performance.now() - t0), fields: keysOf(body) }));
    return XS.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    const SB = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) { emit({ via: 'beacon', method: 'POST', url: new URL(url, location.href).href, status: null, ms: 0, fields: keysOf(data) }); return SB(url, data); };
  }
}

/* Runs in the page's MAIN world. Must be self-contained and return JSON-safe data.
 * paths: dotted window paths ("jQuery.fn.jquery"). Returns { path: version | true }.
 * Also computes '@' specials that need DOM expandos (invisible to content scripts). */
function collectGlobals(paths) {
  const out = {};
  const read = (p) => {
    let o = window;
    for (const k of p.split('.')) {
      if (o === null || o === undefined) return undefined;
      try { o = o[k]; } catch (e) { return undefined; }
    }
    return o;
  };
  for (const p of paths) {
    if (p.charAt(0) === '@') continue;
    try {
      const v = read(p);
      if (v === undefined || v === null || v === false) continue;
      out[p] = typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 64) : true;
    } catch (e) { /* ignore */ }
  }

  try {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook && hook.renderers && hook.renderers.size) {
      for (const r of hook.renderers.values()) {
        if (r && r.version) { out['@react'] = String(r.version); break; }
      }
    }
  } catch (e) { /* ignore */ }

  try {
    const els = document.querySelectorAll('body, body *');
    const max = Math.min(els.length, 4000);
    for (let i = 0; i < max; i++) {
      const el = els[i];
      if (!out['@react']) {
        const keys = Object.keys(el);
        for (const k of keys) {
          if (k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$') ||
              k.startsWith('__reactInternalInstance$') || k === '_reactRootContainer') {
            out['@react'] = true; break;
          }
        }
      }
      if (!out['@vue']) {
        if (el.__vue_app__) out['@vue'] = el.__vue_app__.version || '3';
        else if (el.__vue__) {
          const root = el.__vue__.$root;
          out['@vue'] = (root && root.constructor && root.constructor.version) || '2';
        }
      }
      if (out['@react'] && out['@vue']) break;
    }
  } catch (e) { /* ignore */ }

  try {
    const keys = Object.keys(window);
    if (keys.some((k) => /^webpackChunk|^webpackJsonp/.test(k))) out['@webpack'] = true;
    if (keys.some((k) => k.startsWith('__sveltekit_'))) out['@sveltekit'] = true;
  } catch (e) { /* ignore */ }

  return out;
}
