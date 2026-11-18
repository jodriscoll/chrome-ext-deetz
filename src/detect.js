/* Deetz: detection engine (content script, isolated world).
 * Pure DOM + fetch. No chrome.* APIs, so it can be tested by pasting into any page.
 *
 *   DeetzDetect.scan({ globals }) → Promise<Result>
 *   DeetzDetect.jsPaths()        → window paths the background should read in the MAIN world
 */
(() => {
  if (globalThis.DeetzDetect) return;
  const { RULES, CATEGORIES, WP_SLUGS } = globalThis.DEETZ_RULES;
  const BY_ID = new Map(RULES.map((r) => [r.id, r]));
  const CAT_LABEL = new Map(CATEGORIES);

  const WP_ASSET = /\/(?:wp-content|app)\/(plugins|mu-plugins|themes)\/([^/?#]+)\//i;
  const CORS_OK = /^https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|ajax\.googleapis\.com|code\.jquery\.com|(?:stackpath|maxcdn)\.bootstrapcdn\.com|use\.fontawesome\.com|fonts\.googleapis\.com)\//i;
  const PRIO = { meta: 6, header: 5, js: 5, dom: 5, file: 4, theme: 6, html: 3, url: 3, cookie: 2, ver: 1 };
  const JS_LABEL = {
    '@react': 'React fiber attached to DOM nodes',
    '@vue': 'Vue app instance attached to DOM',
    '@webpack': 'window.webpackChunk* runtime',
    '@sveltekit': 'window.__sveltekit_* runtime',
  };

  // ── helpers ────────────────────────────────────────────────────────────
  const list = (x, key) => (x || []).map((m) => (m instanceof RegExp || typeof m === 'string' ? { [key]: m } : m));
  const pairs = (o) => Object.entries(o || {}).map(([k, v]) => [k, v instanceof RegExp ? { re: v } : v]);
  const cleanVersion = (v) => {
    if (v == null || v === true) return null;
    const m = String(v).trim().replace(/^v/i, '').match(/^\d+(?:\.\d+){0,3}/);
    return m ? m[0] : null;
  };
  const verParam = (u) => {
    try {
      const p = new URL(u).searchParams.get('ver');
      return p && /^\d+(?:\.\d+){1,3}$/.test(p) ? p : null;
    } catch { return null; }
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const sameOrigin = (u) => { try { return new URL(u).origin === location.origin; } catch { return false; } };
  const snippet = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 140);
  const pretty = (slug) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bWp\b/g, 'WP').replace(/\bSeo\b/g, 'SEO').replace(/\bGdpr\b/g, 'GDPR').replace(/\bAcf\b/g, 'ACF')
    .replace(/\bApi\b/g, 'API').replace(/\bCpt\b/g, 'CPT').replace(/\bUi\b/g, 'UI');

  function jsPaths() {
    const s = new Set();
    for (const r of RULES) {
      for (const [k, v] of Object.entries(r.js || {})) { s.add(k); if (typeof v === 'string') s.add(v); }
      for (const t of r.tags || []) if (t.js) s.add(t.js);
    }
    return [...s];
  }

  // ── gather ─────────────────────────────────────────────────────────────
  function collectUrls() {
    const set = new Set();
    const add = (u) => {
      if (!u || /^(?:data|blob|javascript|about):/i.test(u)) return;
      const a = abs(u); if (a) set.add(a);
    };
    document.querySelectorAll('script[src]').forEach((e) => add(e.getAttribute('src')));
    document.querySelectorAll('link[href]').forEach((e) => add(e.getAttribute('href')));
    document.querySelectorAll('img').forEach((e) => add(e.currentSrc || e.getAttribute('src')));
    document.querySelectorAll('[srcset]').forEach((e) =>
      (e.getAttribute('srcset') || '').split(',').forEach((p) => add(p.trim().split(/\s+/)[0])));
    document.querySelectorAll('iframe[src],video[src],audio[src],source[src],embed[src]').forEach((e) => add(e.getAttribute('src')));
    try { performance.getEntriesByType('resource').forEach((e) => add(e.name)); } catch { /* ignore */ }
    return [...set].slice(0, 5000);
  }

  function collectMeta() {
    const meta = {};
    document.querySelectorAll('meta').forEach((m) => {
      const k = (m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || '').toLowerCase();
      if (k) (meta[k] = meta[k] || []).push(m.getAttribute('content') || '');
    });
    return meta;
  }

  async function fetchHeaders() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(location.href, { credentials: 'include', cache: 'no-store', signal: ctrl.signal });
      const h = {};
      res.headers.forEach((v, k) => { k = k.toLowerCase(); h[k] = h[k] ? h[k] + ', ' + v : v; });
      ctrl.abort(); // headers are all we need; drop the body
      return h;
    } catch { return null; } finally { clearTimeout(t); }
  }

  // First few KB of a JS/CSS file: license banners carry exact versions.
  const headCache = new Map();
  function readHead(url, bytes = 4096) {
    const key = url + '|' + bytes;
    if (headCache.has(key)) return headCache.get(key);
    const p = (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, credentials: sameOrigin(url) ? 'include' : 'omit' });
        if (!res.ok || !res.body) return null;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let txt = '';
        while (txt.length < bytes) {
          const { done, value } = await reader.read();
          if (done) break;
          txt += dec.decode(value, { stream: true });
        }
        reader.cancel().catch(() => {});
        return txt.slice(0, bytes);
      } catch { return null; } finally { clearTimeout(t); ctrl.abort(); }
    })();
    headCache.set(key, p);
    return p;
  }

  // Full text of the page's JS and CSS (same-origin, or CDNs that allow CORS), plus inline blocks.
  // Used for bundle signatures, license banners, source maps, and source code search.
  const codeCache = new Map();
  async function readAll(url, cap) {
    if (codeCache.has(url)) return codeCache.get(url);
    const p = (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, credentials: sameOrigin(url) ? 'include' : 'omit' });
        if (!res.ok) return null;
        const map = res.headers.get('sourcemap') || res.headers.get('x-sourcemap');
        const text = await res.text();
        return { text: text.length > cap ? text.slice(0, cap) : text, bytes: text.length, map };
      } catch { return null; } finally { clearTimeout(t); }
    })();
    codeCache.set(url, p);
    return p;
  }
  async function collectCode() {
    const want = new Map();
    const consider = (u, kind) => {
      u = abs(u);
      if (!u || want.has(u)) return;
      if (!(sameOrigin(u) || CORS_OK.test(u))) return;
      want.set(u, kind);
    };
    document.querySelectorAll('script[src]').forEach((e) => consider(e.getAttribute('src'), 'js'));
    document.querySelectorAll('link[rel="modulepreload"][href],link[rel="preload"][as="script"][href]').forEach((e) => consider(e.getAttribute('href'), 'js'));
    document.querySelectorAll('link[rel~="stylesheet"][href]').forEach((e) => consider(e.getAttribute('href'), 'css'));
    try {
      performance.getEntriesByType('resource').forEach((e) => {
        if (e.initiatorType === 'script' || /\.m?js(?:[?#]|$)/.test(e.name)) consider(e.name, 'js');
        else if (/\.css(?:[?#]|$)/.test(e.name)) consider(e.name, 'css');
      });
    } catch { /* ignore */ }
    const list = [...want.entries()].slice(0, 40);
    const files = [];
    let budget = 16e6;
    for (let i = 0; i < list.length; i += 6) {
      const batch = list.slice(i, i + 6);
      const got = await Promise.all(batch.map(([u]) => readAll(u, 6e6)));
      got.forEach((g, j) => {
        if (!g || budget <= 0) return;
        budget -= g.text.length;
        files.push({ url: batch[j][0], kind: batch[j][1], text: g.text, bytes: g.bytes, mapHeader: g.map });
      });
    }
    document.querySelectorAll('script:not([src])').forEach((e, i) => {
      const t = e.textContent || '';
      if (t.trim() && !/json/i.test(e.type || '')) files.push({ url: `inline <script> #${i + 1}`, kind: 'js', text: t.slice(0, 1e6), bytes: t.length, inline: true });
    });
    document.querySelectorAll('style').forEach((e, i) => {
      const t = e.textContent || '';
      if (t.trim()) files.push({ url: `inline <style> #${i + 1}`, kind: 'css', text: t.slice(0, 1e6), bytes: t.length, inline: true });
    });
    return files;
  }

  // Source maps list the original files, which names every npm package and the source language.
  async function readSourceMaps(files) {
    const out = { maps: 0, packages: new Map(), exts: new Map(), firstParty: 0, mapUrls: [] };
    for (const f of files) {
      if (f.kind !== 'js' || f.inline) continue;
      const m = /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(f.text.slice(-500)) ;
      const ref = f.mapHeader || (m && m[1]);
      if (!ref || ref.startsWith('data:')) continue;
      let mapUrl;
      try { mapUrl = new URL(ref, f.url).href; } catch { continue; }
      if (!sameOrigin(mapUrl) || out.mapUrls.length >= 6) continue;
      const got = await readAll(mapUrl, 30e6);
      if (!got) continue;
      let json;
      try { json = JSON.parse(got.text); } catch { continue; }
      out.maps++;
      out.mapUrls.push(mapUrl);
      for (const src of json.sources || []) {
        const nm = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(src);
        if (nm) out.packages.set(nm[1], (out.packages.get(nm[1]) || 0) + 1);
        else {
          out.firstParty++;
          const ext = (/\.([a-z]+)(?:\?.*)?$/i.exec(src) || [])[1];
          if (ext) out.exts.set(ext.toLowerCase(), (out.exts.get(ext.toLowerCase()) || 0) + 1);
        }
      }
    }
    return out;
  }

  async function collectBanners() {
    const files = [];
    document.querySelectorAll('script[src],link[rel~="stylesheet"][href]').forEach((e) => {
      const u = abs(e.getAttribute('src') || e.getAttribute('href'));
      // Only same-origin or CORS-friendly CDNs, so we never spam the console with CORS errors.
      if (u && /\.(?:m?js|css)(?:[?#]|$)/i.test(u) && (sameOrigin(u) || CORS_OK.test(u))) files.push(u);
    });
    const picked = [...new Set(files)].slice(0, 40);
    const out = [];
    for (let i = 0; i < picked.length; i += 8) {
      const batch = picked.slice(i, i + 8);
      const texts = await Promise.all(batch.map((u) => readHead(u)));
      texts.forEach((text, j) => { if (text) out.push({ url: batch[j], text }); });
    }
    return out;
  }

  // ── matching ───────────────────────────────────────────────────────────
  function entry(found, rule) {
    let e = found.get(rule.id);
    if (!e) { e = { rule, ev: [], vers: [], tags: new Set(), via: new Set(), strong: false, more: 0 }; found.set(rule.id, e); }
    return e;
  }
  function hit(found, rule, ev, version, prio = 1) {
    const e = entry(found, rule);
    if (!ev.weak) e.strong = true;
    if (!e.ev.some((x) => x.type === ev.type && x.value === ev.value && x.note === ev.note)) {
      if (e.ev.length < 6) e.ev.push(ev); else e.more++;
    }
    const v = cleanVersion(version);
    if (v) e.vers.push({ v, prio, from: ev.type });
    return e;
  }

  function matchRule(rule, ctx, found) {
    const add = (ev, version, prio) => hit(found, rule, ev, version, prio);

    for (const m of list(rule.dom, 'sel')) {
      let all;
      try { all = document.querySelectorAll(m.sel); } catch { continue; }
      if (!all.length) continue;
      add({ type: 'dom', value: m.sel + (all.length > 1 ? `  ×${all.length}` : ''), weak: m.weak },
        m.attr ? all[0].getAttribute(m.attr) : null, PRIO.dom);
    }

    for (const m of list(rule.src, 're')) {
      let n = 0;
      for (const u of ctx.urls) {
        const r = m.re.exec(u);
        if (!r) continue;
        let v = r[1] || null, p = PRIO.url;
        if (!v) {
          // ?ver= inside a plugin/theme folder is that plugin's version, not the library's.
          const own = rule.cat === 'plugins' || rule.cat === 'theme' || (rule.cat !== 'hosting' && !WP_ASSET.test(u));
          v = own ? verParam(u) : null; p = PRIO.ver;
        }
        add({ type: 'url', value: u, weak: m.weak }, v, p);
        if (++n >= 4) break;
      }
    }

    for (const m of list(rule.html, 're')) {
      const r = m.re.exec(ctx.html);
      if (r) add({ type: 'html', value: snippet(r[0]), weak: m.weak }, r[1], PRIO.html);
    }

    for (const [name, m] of pairs(rule.meta)) {
      for (const c of ctx.meta[name] || []) {
        const r = m.re.exec(c);
        if (r) add({ type: 'meta', value: `${name}="${c}"`, weak: m.weak }, r[1], PRIO.meta);
      }
    }

    for (const [name, m] of pairs(rule.headers)) {
      const v = ctx.headers[name];
      if (v == null) continue;
      const r = m.re.exec(v);
      if (r) add({ type: 'header', value: `${name}: ${v}`, weak: m.weak }, r[1], PRIO.header);
    }

    for (const m of list(rule.cookies, 're')) {
      const c = ctx.cookies.find((n) => m.re.test(n));
      if (c) add({ type: 'cookie', value: c, weak: m.weak });
    }

    for (const [k, vp] of Object.entries(rule.js || {})) {
      if (!(k in ctx.globals)) continue;
      add({ type: 'js', value: JS_LABEL[k] || `window.${k}` }, typeof vp === 'string' ? ctx.globals[vp] : null, PRIO.js);
    }

    for (const m of list(rule.banner, 're')) {
      for (const b of ctx.banners) {
        const r = m.re.exec(b.text);
        if (r) { add({ type: 'file', value: b.url, note: snippet(r[0]) }, r[1], PRIO.file); break; }
      }
    }

    for (const m of list(rule.bundle, 're')) {
      for (const f of ctx.code) {
        if (f.kind !== 'js') continue;
        const r = m.re.exec(f.text);
        if (r) { add({ type: 'code', value: f.url, note: snippet(r[0]).slice(0, 70), weak: m.weak }, r[1], PRIO.file); break; }
      }
    }

    if (rule.custom && CUSTOM[rule.custom]) CUSTOM[rule.custom](ctx, add);

    const e = found.get(rule.id);
    if (e) evalTags(rule, ctx, e);
  }

  function evalTags(rule, ctx, e) {
    for (const t of rule.tags || []) {
      let ok = false;
      try {
        if (t.js) ok = ok || t.js in ctx.globals;
        if (t.dom) ok = ok || !!document.querySelector(t.dom);
        if (t.src) ok = ok || ctx.urls.some((u) => t.src.test(u));
        if (t.html) ok = ok || t.html.test(ctx.html);
        if (t.bundle) ok = ok || ctx.code.some((f) => f.kind === 'js' && t.bundle.test(f.text));
        if (t.header) ok = ok || (ctx.headers[t.header[0]] != null && t.header[1].test(ctx.headers[t.header[0]]));
      } catch { /* ignore */ }
      if (ok) e.tags.add(t.tag);
    }
    if (rule.ids) {
      const hay = ctx.html + '\n' + ctx.urls.join('\n');
      for (const re of rule.ids) {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let m, n = 0;
        while ((m = g.exec(hay)) && n++ < 30) e.tags.add(m[1] || m[0]);
      }
    }
  }

  // ── custom detectors ───────────────────────────────────────────────────
  const TW_CLASS = /^(?:[a-z0-9]+:)+[a-z]|^(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?$/;
  const TW_GENERIC = /^-?(?:(?:p|m)[trblxyse]?-(?:\d|px)|(?:gap|space-[xy])-\d|(?:w|h|size|min-w|max-w|min-h|max-h)-(?:\d|full|screen|auto|fit|\[)|text-(?:xs|sm|base|lg|[2-9]?xl)$|rounded(?:-|$)|flex-(?:col|row|wrap|1)$|items-(?:center|start|end)$|justify-(?:center|between|start|end)$|grid-cols-\d|col-span-\d|leading-|tracking-|font-(?:bold|semibold|medium|light)$|z-\d|inset-|translate-|opacity-\d|duration-\d|transition(?:-|$))/;

  const CUSTOM = {
    tailwind(ctx, add) {
      if (/--tw-[a-z]/.test(ctx.html)) {
        add({ type: 'html', value: '--tw-* custom properties in the page' }, null, 0);
      } else {
        outer: for (const s of document.styleSheets) {
          let rules;
          try { rules = s.cssRules; } catch { continue; }
          const n = Math.min(rules.length, 4000);
          for (let i = 0; i < n; i++) {
            if (rules[i].cssText.includes('--tw-')) {
              add({ type: 'css', value: `${s.href || 'inline <style>'} uses --tw-* properties` }, null, 0);
              break outer;
            }
          }
        }
      }
      const strong = new Set(), generic = new Set();
      const els = document.querySelectorAll('[class]');
      const max = Math.min(els.length, 4000);
      for (let i = 0; i < max; i++) {
        const cl = els[i].classList;
        for (let j = 0; j < cl.length; j++) {
          const c = cl[j];
          if (TW_CLASS.test(c)) strong.add(c); else if (TW_GENERIC.test(c)) generic.add(c);
        }
      }
      if (strong.size >= 3 && strong.size + generic.size >= 20) {
        add({ type: 'dom', value: `${strong.size + generic.size} Tailwind-style utility classes (e.g. ${[...strong].slice(0, 3).join(', ')})`, weak: true });
      }
    },

    schema(ctx, add) {
      const types = new Set();
      const blocks = document.querySelectorAll('script[type="application/ld+json"]');
      const walk = (n, d = 0) => {
        if (!n || d > 4) return;
        if (Array.isArray(n)) return n.forEach((x) => walk(x, d + 1));
        if (typeof n !== 'object') return;
        [].concat(n['@type'] || []).forEach((t) => types.add(String(t)));
        if (n['@graph']) walk(n['@graph'], d + 1);
      };
      blocks.forEach((b) => { try { walk(JSON.parse(b.textContent)); } catch { /* invalid JSON-LD */ } });
      const micro = document.querySelectorAll('[itemscope][itemtype*="schema.org"]');
      micro.forEach((m) => types.add((m.getAttribute('itemtype') || '').split('/').pop()));
      if (!blocks.length && !micro.length) return;
      const e = add({ type: 'dom', value: `${blocks.length} JSON-LD block(s), ${micro.length} microdata item(s)` });
      [...types].filter(Boolean).slice(0, 10).forEach((t) => e.tags.add(t));
    },
  };

  // ── WordPress: any plugin or theme, named or not ───────────────────────
  async function wordpressAssets(ctx, found) {
    const isWP = found.has('wordpress');
    if (!isWP && !ctx.urls.some((u) => u.includes('/wp-content/'))) return;
    const re = isWP ? WP_ASSET : /\/wp-content\/(plugins|mu-plugins|themes)\/([^/?#]+)\//i;
    const plugins = new Map(), themes = new Map();
    const note = (map, slug, x) => {
      let o = map.get(slug);
      if (!o) { o = { urls: [], vers: [], mu: false, base: null, fromHtml: false }; map.set(slug, o); }
      if (x.url && o.urls.length < 4) o.urls.push(x.url);
      if (x.url) { const v = verParam(x.url); if (v) o.vers.push(v); }
      if (x.mu) o.mu = true;
      if (x.base && !o.base) o.base = x.base;
      if (x.html) o.fromHtml = true;
    };
    for (const u of ctx.urls) {
      const m = re.exec(u);
      if (!m) continue;
      const kind = m[1].toLowerCase();
      const slug = decodeURIComponent(m[2]);
      note(kind === 'themes' ? themes : plugins, slug, { url: u, mu: kind === 'mu-plugins', base: u.slice(0, m.index + m[0].length) });
    }
    // Paths referenced only in inline CSS/JS/config.
    const g = /\/wp-content\/(plugins|mu-plugins|themes)\/([a-z0-9._-]+)\//gi;
    let m;
    while ((m = g.exec(ctx.html))) {
      const kind = m[1].toLowerCase();
      const map = kind === 'themes' ? themes : plugins;
      if (!map.has(m[2])) note(map, m[2], { html: true, mu: kind === 'mu-plugins' });
    }

    for (const [slug, o] of plugins) {
      const rule = WP_SLUGS.get(slug.toLowerCase()) ||
        BY_ID.get('wp:' + slug) ||
        { id: 'wp:' + slug, name: pretty(slug), cat: 'plugins', auto: true };
      const version = mode(o.vers);
      if (o.urls.length) o.urls.forEach((u) => hit(found, rule, { type: 'url', value: u }, version, PRIO.ver + 1));
      else hit(found, rule, { type: 'html', value: `/wp-content/${o.mu ? 'mu-plugins' : 'plugins'}/${slug}/ referenced in page source` }, null);
      if (o.mu) found.get(rule.id).tags.add('must-use');
    }

    const themeInfos = [];
    for (const [slug, o] of themes) {
      const base = o.base || `${location.origin}/wp-content/themes/${slug}/`;
      const rule = { id: 'wpt:' + slug, name: pretty(slug), cat: 'theme', auto: true };
      const e = entry(found, rule);
      e.strong = true;
      (o.urls.length ? o.urls : [`${base} (referenced in page source)`]).slice(0, 3)
        .forEach((u) => e.ev.push({ type: 'url', value: u }));
      themeInfos.push(readHead(base + 'style.css', 8192).then((css) => ({ slug, base, css, e })));
    }
    for (const { slug, base, css, e } of await Promise.all(themeInfos)) {
      if (!css) continue;
      const field = (f) => { const r = new RegExp('^[\\s*#@]*' + f + ':\\s*(.+)$', 'mi').exec(css); return r ? r[1].trim() : null; };
      const name = field('Theme Name');
      if (!name) continue;
      e.rule = { ...e.rule, name };
      e.ev.unshift({ type: 'file', value: base + 'style.css', note: `Theme Name: ${name}` });
      const ver = field('Version');
      if (ver) e.vers.push({ v: cleanVersion(ver) || ver, prio: PRIO.theme, from: 'file' });
      const author = field('Author');
      if (author) e.tags.add('by ' + author.replace(/<[^>]+>/g, '').slice(0, 40));
      const parent = field('Template');
      if (parent) {
        e.tags.add('child of ' + parent);
        const pe = found.get('wpt:' + parent);
        if (pe) pe.tags.add('parent theme');
      }
      if (slug && /tailwind/i.test(css)) e.tags.add('Tailwind');
    }
  }

  const mode = (arr) => {
    if (!arr.length) return null;
    const c = new Map();
    arr.forEach((v) => c.set(v, (c.get(v) || 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  // ── derived detectors: things no signature list covers ─────────────────
  const titleCase = (s) => (s === s.toLowerCase() ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);
  const prettyFont = (fam) => titleCase(fam.replace(/_\d{3}\w*$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim());
  const ICON_FONT = /material|ionicons|fontawesome|font awesome|feather|octicons|entypo|evil|simple-line|foundation|zocial|icomoon|glyph|symbols/i;

  function fontsInUse(ctx, found) {
    let faces = [];
    try { faces = [...document.fonts].filter((f) => f.status === 'loaded'); } catch { return; }
    const fams = new Map();
    for (const f of faces) {
      const raw = f.family.replace(/^["']|["']$/g, '');
      const name = prettyFont(raw);
      if (!name || /^deetz/i.test(name)) continue;
      const o = fams.get(name) || { weights: new Set(), raw: new Set() };
      const w = (/_(\d{3})/.exec(raw) || [])[1] || (/^\d{3}$/.test(f.weight) ? f.weight : null);
      if (w) o.weights.add(w);
      o.raw.add(raw);
      fams.set(name, o);
    }
    const fontUrls = ctx.urls.filter((u) => /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(u));
    let n = 0;
    for (const [name, o] of fams) {
      if (n++ >= 14) break;
      const key = name.toLowerCase().replace(/\s+/g, '[-_ ]?');
      const file = fontUrls.find((u) => new RegExp(key, 'i').test(decodeURIComponent(u)));
      const rule = { id: 'font:' + name.toLowerCase(), name, cat: 'fonts' };
      const e = hit(found, rule, { type: 'font', value: `document.fonts: ${[...o.raw].slice(0, 4).join(', ')}` });
      if (file) e.ev.push({ type: 'url', value: file });
      if (o.weights.size) e.tags.add([...o.weights].sort().join(' · '));
      if (ICON_FONT.test(name)) e.tags.add('icon font');
      if (file) e.tags.add(/fonts\.gstatic\.com/.test(file) ? 'Google Fonts' : /typekit/.test(file) ? 'Adobe Fonts' : sameOrigin(file) ? 'self-hosted' : new URL(file).host);
    }
  }

  function languageLevel(ctx, found) {
    const js = ctx.code.filter((f) => f.kind === 'js' && !f.inline);
    if (!js.length) return;
    const count = (re) => js.reduce((n, f) => n + ((f.text.match(re) || []).length), 0);
    const feats = [
      ['ES2022', 'private class fields', count(/this\.#[A-Za-z_$]/g) + count(/#[A-Za-z_$][\w$]* in /g)],
      ['ES2022', 'class static blocks', count(/static\s*\{/g)],
      ['ES2020', 'optional chaining', count(/[\w)\]]\?\.[A-Za-z_$(\[]/g)],
      ['ES2020', 'nullish coalescing', count(/[\w)\]]\s*\?\?\s*[\w("'\[!-]/g)],
      ['ES2017', 'async/await', count(/\basync\s*(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/g)],
      ['ES2015', 'classes', count(/\bclass\s+[A-Za-z_$][\w$]*\s*(?:extends\b|\{)/g)],
      ['ES2015', 'arrow functions', count(/=>/g)],
      ['ES2015', 'let/const', count(/\b(?:let|const)\s+[A-Za-z_${\[]/g)],
    ].filter((f) => f[2] >= 3);
    if (!feats.length) return;
    const level = feats[0][0];
    const rule = { id: 'js-level', name: 'JavaScript', cat: 'build' };
    const e = hit(found, rule, { type: 'code', value: `${js.length} script file(s), ${(js.reduce((n, f) => n + f.bytes, 0) / 1024).toFixed(0)} KB scanned` }, null);
    e.ev.push(...feats.slice(0, 5).map(([lvl, name, n]) => ({ type: 'syntax', value: `${name} (${lvl}) × ${n}` })));
    e.label = level + '+';
    feats.slice(0, 3).forEach((f) => e.tags.add(f[1]));
    const esm = document.querySelector('script[type="module"],link[rel="modulepreload"]');
    if (esm) hit(found, { id: 'esm', name: 'ES modules', cat: 'build' }, { type: 'dom', value: esm.outerHTML.slice(0, 120) });
  }

  function packagesFromMaps(maps, found) {
    if (!maps.maps) return;
    const top = [...maps.packages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
    for (const [pkg, n] of top) {
      const e = hit(found, { id: 'npm:' + pkg, name: pkg, cat: 'packages' }, { type: 'map', value: `${n} source file(s) in ${maps.mapUrls[0]}` });
      e.tags.add(`${n} file${n > 1 ? 's' : ''}`);
    }
    const ts = (maps.exts.get('ts') || 0) + (maps.exts.get('tsx') || 0);
    if (ts) {
      const e = hit(found, { id: 'typescript', name: 'TypeScript', cat: 'build' }, { type: 'map', value: `${ts} .ts/.tsx source files listed in source maps` });
      e.tags.add(`${ts} files`);
    }
    for (const [ext, name] of [['vue', 'Vue SFCs'], ['svelte', 'Svelte components'], ['astro', 'Astro components'], ['jsx', 'JSX'], ['scss', 'Sass'], ['mdx', 'MDX']]) {
      const n = maps.exts.get(ext);
      if (n) hit(found, { id: 'src:' + ext, name, cat: 'build' }, { type: 'map', value: `${n} .${ext} source files listed in source maps` });
    }
  }

  // npm package folders that leak into asset URLs (Expo, Vite dev, unbundled sites).
  function packagesFromUrls(ctx, found) {
    const seen = new Map();
    const re = /node_modules\/((?:@[^/]+\/)?[^/?#]+)/g;
    for (const u of ctx.urls) { let m; while ((m = re.exec(u))) if (!seen.has(m[1])) seen.set(m[1], u); }
    for (const f of ctx.code) { if (f.kind !== 'js') continue; let m; let n = 0; while ((m = re.exec(f.text)) && n++ < 200) if (!seen.has(m[1])) seen.set(m[1], f.url); }
    for (const [pkg, where] of seen) {
      if (found.has('npm:' + pkg) || /[^\w@/.-]/.test(pkg) || [...found.values()].some((e) => e.rule.name === pkg)) continue;
      hit(found, { id: 'npm:' + pkg, name: pkg, cat: 'packages' }, { type: 'url', value: where, note: 'node_modules path' });
    }
  }

  // What the page actually asked Supabase for: tables, auth, storage, functions.
  function supabaseTraffic(ctx, found) {
    const e = found.get('supabase');
    if (!e) return;
    const tables = new Set();
    for (const u of ctx.urls) {
      let url;
      try { url = new URL(u); } catch { continue; }
      if (!/\.supabase\.(?:co|in)$/.test(url.hostname)) continue;
      const p = url.pathname;
      let m;
      if ((m = /^\/rest\/v1\/([\w-]+)/.exec(p))) tables.add(m[1]);
      else if (/^\/auth\/v1\//.test(p)) e.tags.add(/\/user$/.test(p) ? 'Auth (signed in)' : 'Auth');
      else if (/^\/storage\/v1\//.test(p)) e.tags.add('Storage');
      else if (/^\/realtime\/v1\//.test(p)) e.tags.add('Realtime');
      else if ((m = /^\/functions\/v1\/([\w-]+)/.exec(p))) e.tags.add('Edge Function: ' + m[1]);
    }
    if (tables.size) {
      e.tags.add([...tables].slice(0, 4).join(', ') + (tables.size > 4 ? ` +${tables.size - 4}` : ''));
      e.ev.push({ type: 'url', value: `REST tables queried: ${[...tables].join(', ')}` });
    }
  }

  const SEC = [
    ['strict-transport-security', 'HSTS'],
    ['content-security-policy', 'Content-Security-Policy'],
    ['x-frame-options', 'X-Frame-Options'],
    ['x-content-type-options', 'X-Content-Type-Options'],
    ['referrer-policy', 'Referrer-Policy'],
    ['permissions-policy', 'Permissions-Policy'],
    ['cross-origin-opener-policy', 'COOP'],
    ['cross-origin-embedder-policy', 'COEP'],
  ];
  function securityHeaders(ctx, found) {
    for (const [h, label] of SEC) {
      const v = ctx.headers[h] || (h === 'content-security-policy' && ctx.meta[h] && ctx.meta[h][0]);
      if (!v) continue;
      const e = hit(found, { id: 'sec:' + h, name: label, cat: 'security' }, { type: 'header', value: `${h}: ${v}` });
      if (h === 'strict-transport-security') {
        const age = +((/max-age=(\d+)/.exec(v) || [])[1] || 0);
        if (age) e.tags.add(age >= 31536000 ? `${Math.round(age / 31536000 * 10) / 10} yr` : `${Math.round(age / 86400)} days`);
        if (/includesubdomains/i.test(v)) e.tags.add('subdomains');
        if (/preload/i.test(v)) e.tags.add('preload');
      }
      if (h === 'content-security-policy') e.tags.add(`${v.split(';').filter((x) => x.trim()).length} directives`);
    }
  }

  // Same-origin API routes the page called or that its code references, and hosts its code talks to.
  function endpoints(ctx) {
    const routes = new Map();
    const note = (path, how) => { path = path.replace(/[?#].*$/, ''); if (path.length < 60 && !routes.has(path)) routes.set(path, how); };
    try {
      performance.getEntriesByType('resource').forEach((e) => {
        if (!['fetch', 'xmlhttprequest', 'beacon'].includes(e.initiatorType)) return;
        try { const u = new URL(e.name); if (u.origin === location.origin && /^\/(?:api|graphql|wp-json|_actions|trpc|functions)\b/.test(u.pathname)) note(u.pathname, 'called'); } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
    for (const f of ctx.code) {
      if (f.kind !== 'js') continue;
      const re = /["'`](\/(?:api|graphql|trpc|_actions|functions\/v1)\/[\w/.-]{1,60})["'`?]/g;
      let m, n = 0;
      while ((m = re.exec(f.text)) && n++ < 100) note(m[1], 'in code');
    }
    const hosts = new Map();
    for (const f of ctx.code) {
      if (f.kind !== 'js') continue;
      const re = /https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?=[/"'`\s?#:])/gi;
      let m, n = 0;
      while ((m = re.exec(f.text)) && n++ < 3000) {
        const h = m[1].toLowerCase();
        if (h === location.host || /(?:^|\.)(?:w3\.org|schema\.org|reactjs\.org|react\.dev|developer\.mozilla\.org|mdn\.io|github\.com|npmjs\.com|fb\.me|example\.com|localhost)$/.test(h)) continue;
        hosts.set(h, (hosts.get(h) || 0) + 1);
      }
    }
    const data = (() => { try { return performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'fetch' && /\.json(?:[?#]|$)/.test(e.name)).length; } catch { return 0; } })();
    return {
      routes: [...routes.entries()].map(([path, how]) => ({ path, how })).sort((a, b) => a.path.localeCompare(b.path)),
      hosts: [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([h]) => h),
      dataFiles: data,
    };
  }

  // ── provenance: who loaded this? ───────────────────────────────────────
  function provenance(found) {
    const names = new Map();
    for (const [id, e] of found) if (id.startsWith('wp:') || id.startsWith('wpt:')) names.set(id, e.rule.name);
    for (const e of found.values()) {
      if (!['libs', 'ui', 'fonts', 'frameworks', 'analytics', 'monitoring', 'widgets', 'privacy', 'marketing'].includes(e.rule.cat)) continue;
      for (const ev of e.ev) {
        if (ev.type !== 'url' && ev.type !== 'file') continue;
        const u = ev.value;
        const m = WP_ASSET.exec(u);
        if (m) {
          const kind = m[1].toLowerCase();
          const id = (kind === 'themes' ? 'wpt:' : 'wp:') + m[2];
          const rule = kind === 'themes' ? null : WP_SLUGS.get(m[2].toLowerCase());
          e.via.add(names.get(rule ? rule.id : id) || pretty(m[2]));
        } else if (/\/wp-includes\//.test(u)) e.via.add('WordPress core');
        else if (/\/wp-admin\//.test(u)) e.via.add('WordPress admin');
        else if (!sameOrigin(u) && ['libs', 'ui', 'frameworks', 'fonts'].includes(e.rule.cat)) {
          try { e.via.add(new URL(u).host); } catch { /* ignore */ }
        }
      }
    }
  }

  function implies(found) {
    for (let pass = 0; pass < 3; pass++) {
      for (const e of [...found.values()]) {
        for (const id of e.rule.implies || []) {
          if (found.has(id)) continue;
          const r = BY_ID.get(id);
          if (!r) continue;
          const ie = entry(found, r);
          ie.implied = e.rule.name;
          ie.ev.push({ type: 'implied', value: `implied by ${e.rule.name}` });
        }
      }
    }
  }

  function pickVersion(vers) {
    if (!vers.length) return null;
    const s = new Map();
    for (const x of vers) {
      const o = s.get(x.v) || { v: x.v, prio: -1, n: 0, from: x.from };
      if (x.prio > o.prio) { o.prio = x.prio; o.from = x.from; }
      o.n++;
      s.set(x.v, o);
    }
    return [...s.values()].sort((a, b) => b.prio - a.prio || b.n - a.n || b.v.length - a.v.length)[0];
  }

  // ── page facts ─────────────────────────────────────────────────────────
  function pageFacts(headers, meta) {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const hosts = new Set();
    let bytes = (nav && nav.transferSize) || 0;
    for (const r of res) {
      bytes += r.transferSize || 0;
      try { const h = new URL(r.name).host; if (h && h !== location.host) hosts.add(h); } catch { /* ignore */ }
    }
    const SEC = [
      ['strict-transport-security', 'HSTS'],
      ['content-security-policy', 'Content-Security-Policy'],
      ['x-frame-options', 'X-Frame-Options'],
      ['x-content-type-options', 'X-Content-Type-Options'],
      ['referrer-policy', 'Referrer-Policy'],
      ['permissions-policy', 'Permissions-Policy'],
    ];
    return {
      protocol: (nav && nav.nextHopProtocol) || null,
      requests: res.length + 1,
      bytes,
      thirdParty: [...hosts].sort(),
      domNodes: document.getElementsByTagName('*').length,
      load: nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      lang: document.documentElement.lang || null,
      security: headers
        ? SEC.map(([h, label]) => ({ label, on: h in headers || (h === 'content-security-policy' && !!meta[h]) }))
        : null,
      server: headers ? headers.server || null : null,
    };
  }

  // ── scan ───────────────────────────────────────────────────────────────
  async function scan({ globals = {} } = {}) {
    const t0 = performance.now();
    const [headers, code] = await Promise.all([fetchHeaders(), collectCode()]);
    const banners = code.map((f) => ({ url: f.url, text: f.text.slice(0, 4096) }));
    const ctx = {
      urls: collectUrls(),
      html: document.documentElement.outerHTML.slice(0, 3e6),
      meta: collectMeta(),
      cookies: document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean),
      headers: headers || {},
      globals,
      banners,
      code,
    };

    const found = new Map();
    for (const rule of RULES) {
      try { matchRule(rule, ctx, found); } catch (err) { console.debug('[Deetz] rule failed', rule.id, err); }
    }
    await wordpressAssets(ctx, found);
    const maps = await readSourceMaps(code);
    for (const fn of [fontsInUse, languageLevel, securityHeaders, packagesFromUrls]) {
      try { fn(ctx, found); } catch (err) { console.debug('[Deetz]', fn.name, err); }
    }
    packagesFromMaps(maps, found);
    supabaseTraffic(ctx, found);
    const api = endpoints(ctx);
    if (api.routes.length && found.has('vercel')) {
      const e = hit(found, { id: 'vercel-functions', name: 'Vercel Functions', cat: 'hosting' }, { type: 'route', value: api.routes.map((r) => r.path).slice(0, 6).join('  ') });
      e.tags.add(`${api.routes.length} route${api.routes.length > 1 ? 's' : ''}`);
    }
    lastCode = [{ url: 'Page HTML', kind: 'html', text: ctx.html }, ...code];
    provenance(found);
    implies(found);

    // WordPress appends its own version (?ver=7.1.4) to assets enqueued without one.
    // That number is WordPress's, not the asset's, so drop it everywhere else.
    const wpEntry = found.get('wordpress');
    const wpVer = wpEntry && pickVersion(wpEntry.vers);
    const items = [];
    for (const [id, e] of found) {
      if (wpVer && id !== 'wordpress') e.vers = e.vers.filter((x) => !(x.prio <= PRIO.ver + 1 && x.v === wpVer.v));
      const v = pickVersion(e.vers);
      items.push({
        id,
        name: e.rule.name,
        cat: e.rule.cat,
        catLabel: CAT_LABEL.get(e.rule.cat) || e.rule.cat,
        version: v ? v.v : null,
        versionFrom: v ? v.from : null,
        tags: [...e.tags].slice(0, 8),
        via: [...e.via].slice(0, 3),
        evidence: e.ev,
        more: e.more,
        implied: e.implied || null,
        likely: !e.strong && !e.implied,
        auto: !!e.rule.auto,
        note: e.rule.note || null,
        label: e.label || null,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return {
      url: location.href,
      host: location.host,
      at: Date.now(),
      ms: Math.round(performance.now() - t0),
      items,
      page: { ...pageFacts(headers, ctx.meta), api, code: {
        files: code.filter((f) => !f.inline).length,
        jsBytes: code.filter((f) => f.kind === 'js').reduce((n, f) => n + f.bytes, 0),
        cssBytes: code.filter((f) => f.kind === 'css').reduce((n, f) => n + f.bytes, 0),
        maps: maps.maps,
        firstParty: maps.firstParty,
      } },
      headersOk: !!headers,
      signedIn: document.getElementById('wpadminbar') ? 'WordPress' : null,
    };
  }

  let lastCode = [];
  // Search the page HTML plus every JS/CSS file the last scan read.
  function search(query, { caseSensitive = false, wholeWord = false, regex = false } = {}) {
    if (!query) return { results: [], files: lastCode.length };
    let re;
    try {
      let src = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) src = `\\b(?:${src})\\b`;
      re = new RegExp(src, caseSensitive ? 'g' : 'gi');
    } catch (err) { return { error: String(err.message || err), results: [], files: lastCode.length }; }
    const results = [];
    let total = 0;
    for (const f of lastCode) {
      re.lastIndex = 0;
      let m, n = 0;
      while ((m = re.exec(f.text))) {
        if (m[0] === '') { re.lastIndex++; continue; }
        total++;
        if (n < 8 && results.length < 150) {
          const a = Math.max(0, m.index - 48), b = Math.min(f.text.length, m.index + m[0].length + 48);
          results.push({
            file: f.url, kind: f.kind,
            before: f.text.slice(a, m.index).replace(/\s+/g, ' '),
            match: m[0].slice(0, 120),
            after: f.text.slice(m.index + m[0].length, b).replace(/\s+/g, ' '),
          });
        }
        n++;
        if (total > 5000) break;
      }
    }
    return { results, total, files: lastCode.length };
  }

  globalThis.DeetzDetect = { scan, search, jsPaths, CATEGORIES };
})();
