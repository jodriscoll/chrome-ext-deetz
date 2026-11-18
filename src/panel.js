/* Deetz: in-page panel (content script, isolated world).
 * Styled with shadcn/ui's design system (neutral theme tokens, Tabs, Badge, Button,
 * Input, Checkbox, Alert, DropdownMenu) and Lucide icons, hand-ported to plain DOM so the
 * extension stays a tiny, build-free content script. Lives in a closed Shadow DOM. */
(() => {
  if (window.__deetz) return;
  window.__deetz = true;

  const VERSION = chrome.runtime.getManifest().version;
  const CATS = new Map(DeetzDetect.CATEGORIES);
  const CAT_ORDER = DeetzDetect.CATEGORIES.map((c) => c[0]);
  const UI_KEY = 'deetz:ui';
  const LAST_KEY = 'deetz:last:' + location.host;

  const TABS = [
    { id: 'all', label: 'All', desc: 'Every technology Deetz found on this page.' },
    { id: 'stack', label: 'Stack', cats: ['cms', 'headless', 'commerce', 'frameworks', 'libs', 'ui', 'fonts', 'build', 'packages'], desc: 'CMS, frameworks, libraries, styling, fonts, and how the code was built.' },
    { id: 'plugins', label: 'Plugins', cats: ['theme', 'plugins'], desc: 'Themes, CMS plugins, and extensions.' },
    { id: 'services', label: 'Services', cats: ['analytics', 'monitoring', 'marketing', 'widgets'], desc: 'Third-party analytics, tags, monitoring, and embeds.' },
    { id: 'hosting', label: 'Hosting', cats: ['hosting', 'server'], desc: 'Hosting, CDN, edge network, server, and runtime.' },
    { id: 'security', label: 'Security', cats: ['privacy', 'security'], desc: 'Security headers, bot protection, CAPTCHA, auth, and consent.' },
    { id: 'page', label: 'Page', cats: ['misc'], desc: 'Network, code, API routes, metadata, and performance.' },
    { id: 'activity', label: 'Activity', desc: 'Live network calls and form submits since you started watching. Field names only, never values.' },
    { id: 'search', label: 'Search', desc: 'Search the HTML and every JS/CSS file Deetz read.' },
  ];

  // Tailwind palette, one hue per category.
  const COLOR = {
    cms: '#8b5cf6', headless: '#06b6d4', commerce: '#10b981', frameworks: '#3b82f6', theme: '#d946ef',
    plugins: '#0ea5e9', libs: '#6366f1', ui: '#ec4899', fonts: '#f97316', analytics: '#f59e0b',
    monitoring: '#ef4444', marketing: '#84cc16', widgets: '#14b8a6', privacy: '#22c55e', security: '#16a34a',
    server: '#ea580c', hosting: '#f43f5e', build: '#64748b', packages: '#a1a1aa', misc: '#78716c',
  };
  const SHORT = {
    cms: 'CMS', headless: 'Content', commerce: 'Commerce', frameworks: 'Framework', theme: 'Theme', plugins: 'Plugin',
    libs: 'Library', ui: 'UI', fonts: 'Font', analytics: 'Analytics', monitoring: 'Monitoring', marketing: 'Marketing',
    widgets: 'Widget', privacy: 'Security', security: 'Header', server: 'Server', hosting: 'Hosting', build: 'Build',
    packages: 'npm', misc: 'Meta',
  };

  const state = {
    visible: false, min: false, watch: false, menu: false, tab: 'all', theme: 'system',
    result: null, diff: null, scanning: false, globalsOk: true,
    expanded: new Set(), pos: { right: 16, bottom: 16 }, size: null, toast: null,
    q: '', opts: { caseSensitive: false, wholeWord: false, regex: false }, found: null,
    activity: [], watchSince: null, baseline: undefined,
  };

  // ── Lucide icons (ISC) ─────────────────────────────────────────────────
  const lu = (d, s = 16) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    refresh: lu('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>', 15),
    eye: lu('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>', 15),
    copy: lu('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', 15),
    minus: lu('<path d="M5 12h14"/>', 15),
    x: lu('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 15),
    sun: lu('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', 15),
    moon: lu('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', 15),
    monitor: lu('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>', 15),
    search: lu('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 14),
    chevron: lu('<path d="m9 18 6-6-6-6"/>', 14),
    check: lu('<path d="M20 6 9 17l-5-5"/>', 12),
    info: lu('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', 14),
    alert: lu('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', 14),
    file: lu('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>', 13),
    logo: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\" width=\"SIZE\" height=\"SIZE\" xmlns:c2pa=\"http://c2pa.org/manifest\"><defs><linearGradient id=\"dz-body\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\"/><stop offset=\"1\" stop-color=\"#E6E8EB\"/></linearGradient><linearGradient id=\"dz-bar\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4A4E53\"/><stop offset=\"1\" stop-color=\"#36393D\"/></linearGradient><linearGradient id=\"dz-corner\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5BD69B\"/><stop offset=\"1\" stop-color=\"#2FA56E\"/></linearGradient><linearGradient id=\"dz-wash\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#E5484D\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#E5484D\" stop-opacity=\".22\"/></linearGradient><linearGradient id=\"dz-beam\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FF6E72\"/><stop offset=\"1\" stop-color=\"#D93A40\"/></linearGradient><filter id=\"dz-shadow\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"150%\"><feDropShadow dx=\"0\" dy=\"2.5\" stdDeviation=\"2.5\" flood-color=\"#000\" flood-opacity=\".28\"/></filter><filter id=\"dz-glow\" x=\"-10%\" y=\"-300%\" width=\"120%\" height=\"700%\"><feGaussianBlur stdDeviation=\"3\"/></filter><clipPath id=\"dz-win\"><rect x=\"27\" y=\"29\" width=\"74\" height=\"70\" rx=\"9\"/></clipPath></defs><g fill=\"none\" stroke=\"url(#dz-corner)\" stroke-width=\"9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" filter=\"url(#dz-shadow)\"><path d=\"M9 34V20A11 11 0 0 1 20 9h14\"/><path d=\"M94 9h14a11 11 0 0 1 11 11v14\"/><path d=\"M119 94v14a11 11 0 0 1-11 11H94\"/><path d=\"M34 119H20a11 11 0 0 1-11-11V94\"/></g><rect x=\"27\" y=\"29\" width=\"74\" height=\"70\" rx=\"9\" fill=\"url(#dz-body)\" filter=\"url(#dz-shadow)\"/><g clip-path=\"url(#dz-win)\"><rect x=\"27\" y=\"29\" width=\"74\" height=\"17\" fill=\"url(#dz-bar)\"/><circle cx=\"36\" cy=\"37.5\" r=\"2.6\" fill=\"#9AA0A6\"/><circle cx=\"44\" cy=\"37.5\" r=\"2.6\" fill=\"#9AA0A6\"/><circle cx=\"52\" cy=\"37.5\" r=\"2.6\" fill=\"#9AA0A6\"/><rect x=\"27\" y=\"46\" width=\"74\" height=\"15\" fill=\"url(#dz-wash)\"/><rect x=\"36\" y=\"51\" width=\"34\" height=\"6\" rx=\"3\" fill=\"#4CC38A\"/><rect x=\"74\" y=\"51\" width=\"16\" height=\"6\" rx=\"3\" fill=\"#4CC38A\" opacity=\".55\"/><rect x=\"36\" y=\"71\" width=\"54\" height=\"6\" rx=\"3\" fill=\"#DADCE0\"/><rect x=\"36\" y=\"82\" width=\"40\" height=\"6\" rx=\"3\" fill=\"#DADCE0\"/></g><rect x=\"14\" y=\"61\" width=\"100\" height=\"6\" rx=\"3\" fill=\"#E5484D\" opacity=\".6\" filter=\"url(#dz-glow)\"/><rect x=\"14\" y=\"61.5\" width=\"100\" height=\"5\" rx=\"2.5\" fill=\"url(#dz-beam)\"/><rect x=\"20\" y=\"62.2\" width=\"88\" height=\"1.2\" rx=\".6\" fill=\"#fff\" opacity=\".45\"/><metadata><c2pa:manifest>AAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTpjMzk2M2NhZC04YmVlLTQxZTgtOGVlYS00YTQwODhhZjhhNWEAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaN2dO8jmFuYUpmPCwL3NnpYAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDpjMGYwYTI4Ny1kZDViLTQ5YzgtYmIyOS1hOTUwMTdjYTc2NmFscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNoTNkR2UdhqqN93ZYIsvLCpgAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFggdqtyTSMbT0QZQXt0kOeGSTrGLk3XvB2AwIRs/7afEBekZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaCNOaMgABOSEZ4dwuLR4PqMAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRMAAAAAAAAAAAAAAAAZGhhc2hYIG76zbI2XD2+Civi0JMz3bk+3EE1RZpGGOPAiQIrkblzZG5hbWVuanVtYmYgbWFuaWZlc3RqZXhjbHVzaW9uc4GiZXN0YXJ0GQqZZmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOmMzOTYzY2FkLThiZWUtNDFlOC04ZWVhLTRhNDA4OGFmOGE1YS9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOjQ3MjU5NzVlLTk1NDItNDI5MS05YmExLWYxZWNiY2MzNWQ5OXJjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCB2q3JNIxtPRBlBe3SQ54ZJOsYuTde8HYDAhGz/tp8QF6JjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggFsxv8lRKiVepPOqspkb4a+lZplDkhiSIpxK9DDGqRl6iY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFggadSpLTgYlr2VzAdahBFxD6VP5cRimROlRs6ff0JZZ5d0Y2xhaW1fZ2VuZXJhdG9yX2luZm+jZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g/oGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd/3cyjxFA3Qo5S46fX0/ihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj+OPEz5o+nMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn/aArXyTwFAZfKrPzxF2vPoJNf1+UCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9+1rdDwSPLMOPOjKuiXjoU/pUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQFz4AU+caV70eniVNF4DR4ZtbIziUgUJwtynPjOT+FKAsShEP0Kitr5mc8r1dwDMbfOjONcVYnrw7ElBTldZIjk=</c2pa:manifest></metadata></svg>".replace(/SIZE/g, '36'),
    logoSm: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\" width=\"SIZE\" height=\"SIZE\" xmlns:c2pa=\"http://c2pa.org/manifest\"><defs><linearGradient id=\"dz-body\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\"/><stop offset=\"1\" stop-color=\"#E6E8EB\"/></linearGradient><linearGradient id=\"dz-bar\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4A4E53\"/><stop offset=\"1\" stop-color=\"#36393D\"/></linearGradient><linearGradient id=\"dz-corner\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5BD69B\"/><stop offset=\"1\" stop-color=\"#2FA56E\"/></linearGradient><linearGradient id=\"dz-wash\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#E5484D\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#E5484D\" stop-opacity=\".22\"/></linearGradient><linearGradient id=\"dz-beam\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FF6E72\"/><stop offset=\"1\" stop-color=\"#D93A40\"/></linearGradient><filter id=\"dz-shadow\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"150%\"><feDropShadow dx=\"0\" dy=\"2.5\" stdDeviation=\"2.5\" flood-color=\"#000\" flood-opacity=\".28\"/></filter><filter id=\"dz-glow\" x=\"-10%\" y=\"-300%\" width=\"120%\" height=\"700%\"><feGaussianBlur stdDeviation=\"3\"/></filter><clipPath id=\"dz-win\"><rect x=\"27\" y=\"29\" width=\"74\" height=\"70\" rx=\"9\"/></clipPath></defs><g fill=\"none\" stroke=\"url(#dz-corner)\" stroke-width=\"9\" stroke-linecap=\"round\" stroke-linejoin=\"round\" filter=\"url(#dz-shadow)\"><path d=\"M9 34V20A11 11 0 0 1 20 9h14\"/><path d=\"M94 9h14a11 11 0 0 1 11 11v14\"/><path d=\"M119 94v14a11 11 0 0 1-11 11H94\"/><path d=\"M34 119H20a11 11 0 0 1-11-11V94\"/></g><rect x=\"27\" y=\"29\" width=\"74\" height=\"70\" rx=\"9\" fill=\"url(#dz-body)\" filter=\"url(#dz-shadow)\"/><g clip-path=\"url(#dz-win)\"><rect x=\"27\" y=\"29\" width=\"74\" height=\"17\" fill=\"url(#dz-bar)\"/><circle cx=\"36\" cy=\"37.5\" r=\"2.6\" fill=\"#9AA0A6\"/><circle cx=\"44\" cy=\"37.5\" r=\"2.6\" fill=\"#9AA0A6\"/><circle cx=\"52\" cy=\"37.5\" r=\"2.6\" fill=\"#9AA0A6\"/><rect x=\"27\" y=\"46\" width=\"74\" height=\"15\" fill=\"url(#dz-wash)\"/><rect x=\"36\" y=\"51\" width=\"34\" height=\"6\" rx=\"3\" fill=\"#4CC38A\"/><rect x=\"74\" y=\"51\" width=\"16\" height=\"6\" rx=\"3\" fill=\"#4CC38A\" opacity=\".55\"/><rect x=\"36\" y=\"71\" width=\"54\" height=\"6\" rx=\"3\" fill=\"#DADCE0\"/><rect x=\"36\" y=\"82\" width=\"40\" height=\"6\" rx=\"3\" fill=\"#DADCE0\"/></g><rect x=\"14\" y=\"61\" width=\"100\" height=\"6\" rx=\"3\" fill=\"#E5484D\" opacity=\".6\" filter=\"url(#dz-glow)\"/><rect x=\"14\" y=\"61.5\" width=\"100\" height=\"5\" rx=\"2.5\" fill=\"url(#dz-beam)\"/><rect x=\"20\" y=\"62.2\" width=\"88\" height=\"1.2\" rx=\".6\" fill=\"#fff\" opacity=\".45\"/><metadata><c2pa:manifest>AAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTpjMzk2M2NhZC04YmVlLTQxZTgtOGVlYS00YTQwODhhZjhhNWEAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaN2dO8jmFuYUpmPCwL3NnpYAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDpjMGYwYTI4Ny1kZDViLTQ5YzgtYmIyOS1hOTUwMTdjYTc2NmFscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNoTNkR2UdhqqN93ZYIsvLCpgAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFggdqtyTSMbT0QZQXt0kOeGSTrGLk3XvB2AwIRs/7afEBekZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaCNOaMgABOSEZ4dwuLR4PqMAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRMAAAAAAAAAAAAAAAAZGhhc2hYIG76zbI2XD2+Civi0JMz3bk+3EE1RZpGGOPAiQIrkblzZG5hbWVuanVtYmYgbWFuaWZlc3RqZXhjbHVzaW9uc4GiZXN0YXJ0GQqZZmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOmMzOTYzY2FkLThiZWUtNDFlOC04ZWVhLTRhNDA4OGFmOGE1YS9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOjQ3MjU5NzVlLTk1NDItNDI5MS05YmExLWYxZWNiY2MzNWQ5OXJjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCB2q3JNIxtPRBlBe3SQ54ZJOsYuTde8HYDAhGz/tp8QF6JjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggFsxv8lRKiVepPOqspkb4a+lZplDkhiSIpxK9DDGqRl6iY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFggadSpLTgYlr2VzAdahBFxD6VP5cRimROlRs6ff0JZZ5d0Y2xhaW1fZ2VuZXJhdG9yX2luZm+jZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g/oGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd/3cyjxFA3Qo5S46fX0/ihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj+OPEz5o+nMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn/aArXyTwFAZfKrPzxF2vPoJNf1+UCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9+1rdDwSPLMOPOjKuiXjoU/pUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQFz4AU+caV70eniVNF4DR4ZtbIziUgUJwtynPjOT+FKAsShEP0Kitr5mc8r1dwDMbfOjONcVYnrw7ElBTldZIjk=</c2pa:manifest></metadata></svg>".replace(/SIZE/g, '26'),
  };

  // shadcn/ui "neutral" theme tokens (v4), light and dark.
  const CSS = `
:host{all:initial}
*,*:before,*:after{box-sizing:border-box;border:0 solid var(--border)}
.wrap{
  --radius:.625rem;
  --background:oklch(1 0 0);--foreground:oklch(.145 0 0);
  --card:oklch(1 0 0);--card-foreground:oklch(.145 0 0);
  --popover:oklch(1 0 0);--popover-foreground:oklch(.145 0 0);
  --primary:oklch(.205 0 0);--primary-foreground:oklch(.985 0 0);
  --secondary:oklch(.97 0 0);--secondary-foreground:oklch(.205 0 0);
  --muted:oklch(.97 0 0);--muted-foreground:oklch(.556 0 0);
  --accent:oklch(.97 0 0);--accent-foreground:oklch(.205 0 0);
  --destructive:oklch(.577 .245 27.325);
  --border:oklch(.922 0 0);--input:oklch(.922 0 0);--ring:oklch(.708 0 0);
  --shadow:0 10px 38px -10px rgba(22,23,24,.28),0 10px 20px -15px rgba(22,23,24,.2);
  --mark:oklch(.905 .182 98.111);--mark-fg:oklch(.205 0 0);
  position:fixed;z-index:2147483647;color:var(--foreground);
  font:14px/1.5 "Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;text-align:left;letter-spacing:normal}
.wrap[data-theme="dark"]{
  --background:oklch(.145 0 0);--foreground:oklch(.985 0 0);
  --card:oklch(.205 0 0);--card-foreground:oklch(.985 0 0);
  --popover:oklch(.205 0 0);--popover-foreground:oklch(.985 0 0);
  --primary:oklch(.922 0 0);--primary-foreground:oklch(.205 0 0);
  --secondary:oklch(.269 0 0);--secondary-foreground:oklch(.985 0 0);
  --muted:oklch(.269 0 0);--muted-foreground:oklch(.708 0 0);
  --accent:oklch(.269 0 0);--accent-foreground:oklch(.985 0 0);
  --destructive:oklch(.704 .191 22.216);
  --border:oklch(1 0 0 / 10%);--input:oklch(1 0 0 / 15%);--ring:oklch(.556 0 0);
  --shadow:0 18px 50px -12px rgba(0,0,0,.7),0 0 0 1px rgba(0,0,0,.4);
  --mark:oklch(.554 .135 66.442);--mark-fg:oklch(.985 0 0)}
.wrap[hidden]{display:none}
.mono{font-family:"Geist Mono",ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace}
button{font:inherit;color:inherit;background:none;padding:0;cursor:pointer;text-align:inherit}
svg{flex:none;display:block}

/* Card */
.panel{width:384px;max-height:min(78vh,640px);display:flex;flex-direction:column;background:var(--card);color:var(--card-foreground);
  border:1px solid var(--border);border-radius:calc(var(--radius) + 4px);box-shadow:var(--shadow);overflow:hidden;position:relative}

/* Header */
.head{display:flex;align-items:center;gap:8px;padding:10px 8px 10px 12px;border-bottom:1px solid var(--border);cursor:grab;user-select:none}
.head:active{cursor:grabbing}
.logo{display:grid;place-items:center;width:36px;height:36px;flex:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.15))}
.title{min-width:0;flex:1;line-height:1.2}
.title b{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;letter-spacing:-.01em}
.live{display:inline-flex;align-items:center;gap:5px;font-style:normal;font-size:11px;font-weight:500;color:#22c55e;animation:breathe 2.4s ease-in-out infinite}
.live:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in oklab,#22c55e 22%,transparent)}
@keyframes breathe{0%,100%{opacity:1}50%{opacity:.35}}
.title span{display:block;font-size:12px;color:var(--muted-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.actions{display:flex;gap:2px}

/* Button (ghost, icon-sm) */
.btn{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:calc(var(--radius) - 2px);color:var(--muted-foreground);transition:background .15s,color .15s}
.btn:hover{background:var(--accent);color:var(--accent-foreground)}
.btn:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in oklab,var(--ring) 50%,transparent)}
.btn.on{color:var(--foreground);background:var(--accent)}
.btn.spin svg{animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.btn-primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:calc(var(--radius) - 2px);
  background:var(--primary);color:var(--primary-foreground);font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.btn-primary:hover{opacity:.9}

/* Tabs */
.tabs{display:flex;gap:6px;padding:10px 12px 0}
.searchbtn{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:var(--radius);background:var(--muted);color:var(--muted-foreground);border:1px solid transparent;transition:color .15s,background .15s}
.searchbtn:hover{color:var(--foreground)}
.searchbtn.active{background:var(--background);color:var(--foreground);border-color:var(--border);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.wrap[data-theme="dark"] .searchbtn.active{background:color-mix(in oklab,var(--input) 30%,transparent);border-color:var(--input)}
.tablist{flex:1;min-width:0;display:flex;gap:0;padding:3px;border-radius:var(--radius);background:var(--muted);overflow-x:auto;scrollbar-width:none}
.tablist::-webkit-scrollbar{display:none}
.trigger{flex:none;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 7px;border-radius:calc(var(--radius) - 2px);
  font-size:12px;font-weight:500;color:var(--muted-foreground);white-space:nowrap;border:1px solid transparent;transition:color .15s}
.trigger:hover{color:var(--foreground)}
.trigger.active{background:var(--background);color:var(--foreground);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.wrap[data-theme="dark"] .trigger.active{background:color-mix(in oklab,var(--input) 30%,transparent);border-color:var(--input)}
.trigger .n{font-size:10.5px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.desc{padding:8px 12px 0;font-size:12px;color:var(--muted-foreground)}

/* Alert */
.alerts{display:grid;gap:6px;padding:8px 12px 0}
.alert{display:grid;grid-template-columns:14px 1fr;gap:8px;align-items:start;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;line-height:1.45;background:var(--card)}
.alert svg{margin-top:1px;color:var(--muted-foreground)}
.alert.warn svg{color:#f59e0b}
.alert.ok{color:var(--foreground)}.alert.ok svg{color:#22c55e}

/* Body */
.body{overflow:auto;flex:1;padding:10px 12px 12px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
.list{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.item+.item{border-top:1px solid var(--border)}
.row{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:7px 10px;transition:background .12s}
.row:hover{background:color-mix(in oklab,var(--muted) 60%,transparent)}
.row .dot{width:7px;height:7px;border-radius:2px;background:var(--c);flex:none}
.row .nm{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.row .ver{font-size:11.5px;color:var(--muted-foreground);white-space:nowrap}
.row .sp{flex:1}
.row .chev{color:var(--muted-foreground);transition:transform .15s;opacity:.6}
.item.open .row .chev{transform:rotate(90deg)}
.item.open{background:color-mix(in oklab,var(--muted) 35%,transparent)}
.item.open .row:hover{background:transparent}
.newdot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex:none}
.detail{display:grid;gap:8px;padding:2px 10px 12px 25px}
.sub{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:11.5px;color:var(--muted-foreground)}
.sub .via{margin-right:2px}

/* Badge */
.badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:calc(var(--radius) - 4px);border:1px solid transparent;
  font-size:10.5px;font-weight:500;white-space:nowrap;flex:none}
.badge.cat{color:color-mix(in oklab,var(--c) 78%,var(--foreground));background:color-mix(in oklab,var(--c) 12%,transparent);border-color:color-mix(in oklab,var(--c) 26%,transparent)}
.badge.secondary{background:var(--secondary);color:var(--secondary-foreground)}
.badge.outline{border-color:var(--border);color:var(--muted-foreground)}
.badge.new{background:#22c55e;color:#fff}
.badge.warn{color:#d97706;border-color:color-mix(in oklab,#f59e0b 35%,transparent);background:color-mix(in oklab,#f59e0b 10%,transparent)}
.badge.risk{color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 35%,transparent)}

/* Evidence (Collapsible content) */
.ev{margin:0;padding:8px 10px;border-radius:calc(var(--radius) - 2px);background:var(--muted);font-size:11px;line-height:1.55}
.ln{display:grid;grid-template-columns:52px 1fr;gap:8px}
.ln .t{color:var(--muted-foreground);font-weight:500;letter-spacing:.02em}
.ln .v{word-break:break-all;min-width:0}
.ln em{font-style:normal;color:#16a34a}
.wrap[data-theme="dark"] .ln em{color:#4ade80}
.ln i{font-style:normal;color:#d97706}
.note{color:var(--muted-foreground);margin-top:4px}
.note.risk{color:var(--destructive)}
.gone .nm{text-decoration:line-through;color:var(--muted-foreground)}
.group:first-child{margin-top:0}
.label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px;font-size:13px;font-weight:600;letter-spacing:-.01em;color:var(--foreground)}
.label span:nth-child(2):not(:empty){display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:20px;padding:0 7px;border-radius:999px;
  background:var(--secondary);color:var(--secondary-foreground);border:1px solid var(--border);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
.group{margin-top:18px}

/* Description list (Page tab) */
.kv{display:flex;align-items:center;gap:8px;min-height:32px;padding:6px 10px;font-size:12.5px}
.kv .k{color:var(--muted-foreground)}
.kv .sp{flex:1}
.kv .v{font-variant-numeric:tabular-nums;font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:4px;padding:2px 10px 12px 10px}

/* Input / Checkbox / Search */
.field{display:flex;gap:6px}
.input{flex:1;min-width:0;height:32px;padding:0 10px;border:1px solid var(--input);border-radius:calc(var(--radius) - 2px);background:transparent;color:var(--foreground);
  font-size:13px;outline:none;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:box-shadow .15s,border-color .15s}
.wrap[data-theme="dark"] .input{background:color-mix(in oklab,var(--input) 30%,transparent)}
.input::placeholder{color:var(--muted-foreground)}
.input:focus{border-color:var(--ring);box-shadow:0 0 0 3px color-mix(in oklab,var(--ring) 40%,transparent)}
.checks{display:flex;gap:14px;margin:10px 2px 4px}
.check{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:500;cursor:pointer;user-select:none}
.box{display:grid;place-items:center;width:16px;height:16px;border:1px solid var(--input);border-radius:4px;color:transparent;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.check.on .box{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}
.hits{margin-top:4px}
.hitfile{display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:11.5px;font-weight:500;background:var(--muted);color:var(--muted-foreground);word-break:break-all}
.hit{padding:6px 10px;font-size:11px;line-height:1.5;word-break:break-all;border-top:1px solid var(--border)}
.hit mark{background:var(--mark);color:var(--mark-fg);border-radius:3px;padding:0 2px}
.hit .ctx{color:var(--muted-foreground)}
.empty{padding:28px 12px;text-align:center;font-size:12.5px;color:var(--muted-foreground)}

/* Dropdown menu */
.menu{position:absolute;right:44px;top:44px;z-index:5;min-width:170px;padding:4px;background:var(--popover);color:var(--popover-foreground);
  border:1px solid var(--border);border-radius:calc(var(--radius) - 2px);box-shadow:0 8px 24px -6px rgba(0,0,0,.2)}
.menu button{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border-radius:calc(var(--radius) - 4px);font-size:13px}
.menu button:hover{background:var(--accent);color:var(--accent-foreground)}

/* Footer */
.foot{display:flex;justify-content:space-between;gap:8px;padding:8px 12px;border-top:1px solid var(--border);font-size:11px;color:var(--muted-foreground)}
.foot .toast{color:#16a34a;font-weight:500}

/* Minimized pill */
.pill{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px 0 6px;border-radius:999px;background:var(--card);color:var(--foreground);
  border:1px solid var(--border);box-shadow:var(--shadow);font-size:13px;font-weight:600;cursor:grab}
.pill .logo{width:26px;height:26px}
.pill .badge{height:18px}
.pill .pulse{animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.4}}

/* Resize grips */
.grip{position:absolute;z-index:3}
.grip-b{left:16px;right:16px;bottom:0;height:7px;cursor:ns-resize}
.grip-b:after{content:"";position:absolute;left:50%;bottom:2px;width:28px;height:3px;margin-left:-14px;border-radius:2px;background:var(--border);transition:background .15s}
.grip-b:hover:after,.resizing .grip-b:after{background:var(--ring)}
.grip-l{left:0;top:16px;bottom:16px;width:6px;cursor:ew-resize}
.grip-bl{left:0;bottom:0;width:14px;height:14px;cursor:nesw-resize;z-index:4}
.resizing,.resizing *{user-select:none!important}
`;

  // ── mount ──────────────────────────────────────────────────────────────
  const host = document.createElement('deetz-panel');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${CSS}</style><div class="wrap" hidden></div>`;
  const wrap = root.querySelector('.wrap');
  // The host sits in the browser's top layer (popover) when available, so page transforms,
  // zoom, or overflow can't shift or clip the panel, and site modals can't cover it.
  host.style.cssText = 'position:fixed!important;inset:0!important;width:0!important;height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;display:block!important';
  const usePopover = typeof host.showPopover === 'function';
  if (usePopover) host.setAttribute('popover', 'manual');
  const mount = () => {
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (usePopover) { try { if (!host.matches(':popover-open')) host.showPopover(); } catch { /* ignore */ } }
  };
  mount();

  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const sendScheme = () => chrome.runtime.sendMessage({ type: 'deetz:scheme', scheme: darkMQ.matches ? 'dark' : 'light' }).catch(() => {});
  const applyTheme = () => { wrap.dataset.theme = state.theme === 'system' ? (darkMQ.matches ? 'dark' : 'light') : state.theme; };
  sendScheme();
  darkMQ.addEventListener('change', () => { sendScheme(); applyTheme(); });
  applyTheme();

  chrome.storage.local.get(UI_KEY).then((o) => {
    const ui = o[UI_KEY];
    if (ui) {
      if (ui.pos) state.pos = ui.pos;
      if (ui.size) state.size = ui.size;
      if (ui.theme) state.theme = ui.theme;
      if (ui.tab) state.tab = ui.tab;
      state.min = !!ui.min;
    }
    applyTheme();
    place();
  });
  const saveUI = () => chrome.storage.local.set({ [UI_KEY]: { pos: state.pos, size: state.size, min: state.min, theme: state.theme, tab: state.tab } });

  // ── helpers ────────────────────────────────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (v) => {
    try { const u = new URL(v); return u.origin === location.origin ? u.pathname + u.search : u.host + u.pathname + u.search; } catch { return v; }
  };
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const kb = (b) => (!b ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const fmtTime = (t) => {
    const d = new Date(t), now = new Date();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? time : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
  };
  const fmtClock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const TYPE = { url: 'URL', dom: 'DOM', html: 'HTML', meta: 'META', header: 'HEADER', cookie: 'COOKIE', js: 'JS', file: 'FILE', css: 'CSS', code: 'BUNDLE', implied: 'IMPLIED', font: 'FONT', syntax: 'SYNTAX', map: 'MAP', route: 'ROUTES' };
  const items = () => (state.result ? state.result.items : []);
  const inTab = (tab, i) => (tab.id === 'all' ? i.cat !== 'misc' : (tab.cats || []).includes(i.cat));
  const sortItems = (arr) => arr.slice().sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const countFor = (tab) => (tab.id === 'activity' ? state.activity.length : tab.id === 'search' || tab.id === 'page' ? null : items().filter((i) => inTab(tab, i)).length);

  // ── render ─────────────────────────────────────────────────────────────
  function place() {
    const p = state.pos;
    const w = wrap.offsetWidth || 384, h = wrap.offsetHeight || 60;
    p.right = Math.max(4, Math.min(p.right, innerWidth - w - 4));
    p.bottom = Math.max(4, Math.min(p.bottom, innerHeight - h - 4));
    wrap.style.right = p.right + 'px';
    wrap.style.bottom = p.bottom + 'px';
  }
  const MIN_W = 300, MIN_H = 240;
  function sizeStyle() {
    const z = state.size;
    if (!z) return '';
    return `width:${Math.max(MIN_W, Math.min(z.w, innerWidth - 8))}px;height:${Math.max(MIN_H, Math.min(z.h, innerHeight - 8))}px;max-height:none`;
  }

  function render() {
    wrap.hidden = !state.visible;
    applyTheme();
    if (!state.visible) return;
    const count = items().length;
    if (state.min) {
      wrap.innerHTML = `<button class="pill" data-act="expand" data-drag title="Open Deetz"><span class="logo ${state.watch ? 'pulse' : ''}">${I.logoSm}</span>Deetz<span class="badge secondary">${state.scanning ? '…' : count}</span></button>`;
      place();
      return;
    }
    const scroll = wrap.querySelector('.body')?.scrollTop || 0;
    const visibleTabs = TABS.filter((t) => ['all', 'page', 'search'].includes(t.id) || (t.id === 'activity' ? state.watch || state.activity.length : countFor(t)));
    if (!visibleTabs.some((t) => t.id === state.tab)) state.tab = 'all';
    const tab = TABS.find((t) => t.id === state.tab);
    const themeIcon = state.theme === 'light' ? I.sun : state.theme === 'dark' ? I.moon : I.monitor;
    wrap.innerHTML = `
<div class="panel" style="${sizeStyle()}">
  <div class="grip grip-b" data-resize="b" title="Drag to resize · double-click to reset"></div>
  <div class="grip grip-l" data-resize="l"></div>
  <div class="grip grip-bl" data-resize="bl"></div>
  <div class="head" data-drag>
    <span class="logo">${I.logo}</span>
    <div class="title"><b>Deetz${state.watch ? '<em class="live" title="Rescanning when the page changes and logging network activity">Watching</em>' : ''}</b><span title="${esc(location.href)}">${esc(location.host || location.href)}</span></div>
    <div class="actions">
      <button class="btn ${state.scanning ? 'spin' : ''}" data-act="rescan" title="Rescan">${I.refresh}</button>
      <button class="btn ${state.watch ? 'on' : ''}" data-act="watch" title="${state.watch ? 'Watching for changes (click to stop)' : 'Watch: rescan when the page changes'}">${I.eye}</button>
      <button class="btn" data-act="theme" title="Theme: ${state.theme}">${themeIcon}</button>
      <button class="btn" data-act="copy" title="Copy specs">${I.copy}</button>
      <button class="btn" data-act="min" title="Minimize">${I.minus}</button>
      <button class="btn" data-act="close" title="Close">${I.x}</button>
    </div>
  </div>
  ${state.menu ? `<div class="menu"><button data-act="copy-md">${I.copy} Copy as Markdown</button><button data-act="copy-json">${I.copy} Copy as JSON</button></div>` : ''}
  <div class="tabs"><div class="tablist" role="tablist">${visibleTabs.filter((t) => t.id !== 'search').map((t) => {
    const n = countFor(t);
    return `<button class="trigger ${t.id === state.tab ? 'active' : ''}" role="tab" data-act="tab" data-tab="${t.id}">${esc(t.label)}${n ? `<span class="n">${n}</span>` : ''}</button>`;
  }).join('')}</div><button class="searchbtn ${state.tab === 'search' ? 'active' : ''}" role="tab" data-act="tab" data-tab="search" title="Search source code">${I.search}</button></div>
  <div class="desc">${esc(tab.desc)}</div>
  ${alertsHTML()}
  <div class="body">${bodyHTML(tab)}</div>
  <div class="foot">${footHTML()}</div>
</div>`;
    const body = wrap.querySelector('.body');
    if (body) body.scrollTop = scroll;
    const active = wrap.querySelector('.trigger.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    place();
  }

  function renderBody() {
    const body = wrap.querySelector('.body');
    if (body) body.innerHTML = bodyHTML(TABS.find((t) => t.id === state.tab));
  }

  function alertsHTML() {
    const out = [];
    const r = state.result;
    if (r && r.signedIn) out.push(`<div class="alert warn">${I.alert}<div>You're signed in to ${esc(r.signedIn)}, so this includes scripts only signed-in users get. Rescan signed out to see the public site.</div></div>`);
    if (!state.globalsOk) out.push(`<div class="alert">${I.info}<div>Page JavaScript wasn't readable (access ends when the tab navigates). Click the Deetz toolbar icon to restore it.</div></div>`);
    if (r && !r.headersOk) out.push(`<div class="alert">${I.info}<div>Response headers unavailable, so hosting detection is limited.</div></div>`);
    const d = state.diff;
    if (d && state.tab === 'all' && (d.added.length || d.removed.length)) {
      const parts = [];
      if (d.added.length) parts.push(`${d.added.length} new`);
      if (d.removed.length) parts.push(`${d.removed.length} gone`);
      out.push(`<div class="alert ok">${I.info}<div>${parts.join(' · ')} since ${esc(fmtTime(d.since))}</div></div>`);
    }
    return out.length ? `<div class="alerts">${out.join('')}</div>` : '';
  }

  function footHTML() {
    const r = state.result;
    let left;
    if (state.toast) left = `<span class="toast">${esc(state.toast)}</span>`;
    else if (state.scanning) left = '<span>Scanning…</span>';
    else if (r) left = `<span>${esc(fmtTime(r.at))} · ${r.ms} ms · ${r.page.code.files} files, ${kb(r.page.code.jsBytes + r.page.code.cssBytes)} read</span>`;
    else left = '<span></span>';
    return `${left}<span>v${VERSION}</span>`;
  }

  function bodyHTML(tab) {
    if (tab.id === 'search') return searchHTML();
    if (tab.id === 'activity') return activityHTML();
    const r = state.result;
    if (!r) return `<div class="empty">${state.scanning ? 'Scanning…' : 'No scan yet.'}</div>`;
    if (tab.id === 'page') return pageHTML(r);
    const added = new Set(state.diff ? state.diff.added : []);
    const list = sortItems(items().filter((i) => inTab(tab, i)));
    let out = '';
    if (tab.id === 'all') {
      out += list.length ? `<div class="list">${list.map((i) => rowHTML(i, added.has(i.id))).join('')}</div>` : '<div class="empty">Nothing detected yet.</div>';
      const gone = state.diff ? state.diff.removed : [];
      if (gone.length) {
        out += `<div class="group"><div class="label"><span>Gone since last scan</span><span>${gone.length}</span></div><div class="list">${gone.map((g) =>
          `<div class="item gone"><div class="row"><span class="dot" style="--c:var(--muted-foreground)"></span><span class="nm">${esc(g.name)}</span></div></div>`).join('')}</div></div>`;
      }
      return out;
    }
    // Category tabs: grouped by category.
    for (const cat of tab.cats) {
      const g = list.filter((i) => i.cat === cat);
      if (!g.length) continue;
      out += `<div class="group"><div class="label"><span>${esc(CATS.get(cat))}</span><span>${g.length}</span></div><div class="list">${g.map((i) => rowHTML(i, added.has(i.id))).join('')}</div></div>`;
    }
    return out || '<div class="empty">Nothing in this category.</div>';
  }

  function valHTML(i) {
    if (i.version) return `<span class="ver mono">${esc(i.version)}</span>`;
    if (i.label) return `<span class="ver mono">${esc(i.label)}</span>`;
    return '';
  }

  function rowHTML(i, isNew) {
    const open = state.expanded.has(i.id);
    const flags = [
      isNew ? '<span class="newdot" title="New since last scan"></span>' : '',
      i.implied ? '<span class="badge outline">implied</span>' : '',
      i.likely ? '<span class="badge warn">likely</span>' : '',
      i.note && /compromised/i.test(i.note) ? '<span class="badge risk">risk</span>' : '',
    ].join('');
    const sub = [
      ...i.via.map((v) => `<span class="via">via ${esc(v)}</span>`),
      ...i.tags.slice(0, 8).map((t) => `<span class="badge secondary">${esc(t)}</span>`),
    ].join('');
    return `<div class="item${open ? ' open' : ''}" style="--c:${COLOR[i.cat] || '#a1a1aa'}">
<button class="row" data-act="row" data-id="${esc(i.id)}" title="Show evidence"><span class="dot"></span><span class="nm">${esc(i.name)}</span>${valHTML(i)}${flags}<span class="sp"></span><span class="badge cat">${esc(SHORT[i.cat] || i.cat)}</span><span class="chev">${I.chevron}</span></button>
${open ? `<div class="detail">${sub ? `<div class="sub">${sub}</div>` : ''}${evidenceHTML(i)}</div>` : ''}</div>`;
  }

  function evidenceHTML(i) {
    let out = '<div class="ev mono">';
    if (i.version) out += `<div class="ln"><span class="t">VERSION</span><span class="v">${esc(i.version)} <span style="opacity:.6">from ${esc(TYPE[i.versionFrom] || i.versionFrom)}</span></span></div>`;
    for (const e of i.evidence) {
      const v = e.type === 'url' || e.type === 'file' || e.type === 'code' ? short(e.value) : e.value;
      out += `<div class="ln"><span class="t">${TYPE[e.type] || esc(e.type).toUpperCase()}</span><span class="v" title="${esc(e.value)}">${esc(clip(v, 180))}${e.note ? ` <em>${esc(clip(e.note, 90))}</em>` : ''}${e.weak ? ' <i>(heuristic)</i>' : ''}</span></div>`;
    }
    if (i.more) out += `<div class="note">+${i.more} more signals</div>`;
    if (i.tags.length > 8) out += `<div class="note">${i.tags.map(esc).join(' · ')}</div>`;
    if (i.auto) out += '<div class="note">Found by folder name; Deetz has no rule for it yet.</div>';
    if (i.likely) out += '<div class="note">Only heuristic signals matched: likely, not certain.</div>';
    if (i.note) out += `<div class="note ${/compromised/i.test(i.note) ? 'risk' : ''}">${esc(i.note)}</div>`;
    return out + '</div>';
  }

  function pageHTML(r) {
    const p = r.page;
    const kv = (k, v) => `<div class="item"><div class="kv"><span class="k">${esc(k)}</span><span class="sp"></span><span class="v mono">${esc(v)}</span></div></div>`;
    const exp = (id, k, v, inner) => {
      const open = state.expanded.has(id);
      return `<div class="item${open ? ' open' : ''}"><button class="row kv" data-act="row" data-id="${id}"><span class="k">${esc(k)}</span><span class="sp"></span><span class="v mono">${esc(v)}</span><span class="chev">${I.chevron}</span></button>${open ? inner : ''}</div>`;
    };
    const chips = (arr) => `<div class="chips">${arr.map((x) => `<span class="badge secondary mono">${esc(x)}</span>`).join('') || '<span class="note">None</span>'}</div>`;
    let out = '';

    out += '<div class="group"><div class="label"><span>Network</span></div><div class="list">';
    if (p.protocol) out += kv('Protocol', p.protocol === 'h2' ? 'HTTP/2' : p.protocol === 'h3' ? 'HTTP/3' : p.protocol.toUpperCase());
    out += kv('Requests', String(p.requests));
    out += kv('Transferred', kb(p.bytes));
    if (p.load) out += kv('Load event', (p.load / 1000).toFixed(2) + ' s');
    out += exp('page:hosts', 'Third-party hosts', String(p.thirdParty.length), chips(p.thirdParty));
    if (p.api.dataFiles) out += kv('JSON data requests', String(p.api.dataFiles));
    out += '</div></div>';

    out += '<div class="group"><div class="label"><span>Code</span></div><div class="list">';
    out += kv('JavaScript read', kb(p.code.jsBytes));
    out += kv('CSS read', kb(p.code.cssBytes));
    out += kv('Files scanned', String(p.code.files));
    out += kv('Source maps', p.code.maps ? `${p.code.maps} found` : 'not published');
    out += kv('DOM nodes', p.domNodes.toLocaleString());
    out += kv('Service worker', p.sw ? 'active' : 'none');
    if (p.lang) out += kv('Language', p.lang);
    out += '</div></div>';

    out += `<div class="group"><div class="label"><span>APIs</span><span>${p.api.routes.length}</span></div><div class="list">`;
    out += exp('page:routes', 'API routes', String(p.api.routes.length),
      `<div class="chips">${p.api.routes.map((x) => `<span class="badge secondary mono" title="${x.how}">${esc(x.path)}</span>`).join('') || '<span class="note">None found</span>'}</div>`);
    out += exp('page:codehosts', 'Hosts referenced in code', String(p.api.hosts.length), chips(p.api.hosts));
    out += '</div>';
    if (p.api.routes.length) {
      out += `<div class="alert" style="margin-top:6px">${I.info}<div>Anything these routes call on the server (email like Resend, databases, payment webhooks) never reaches the browser, so no extension can see it.</div></div>`;
    }
    out += '</div>';

    if (p.security) {
      const on = p.security.filter((s) => s.on).length;
      out += `<div class="group"><div class="label"><span>Security headers</span><span>${on}/${p.security.length}</span></div><div class="list">${p.security.map((s) =>
        `<div class="item"><div class="kv"><span class="k">${esc(s.label)}</span><span class="sp"></span><span class="badge ${s.on ? 'cat' : 'outline'}" style="--c:#16a34a">${s.on ? 'set' : 'missing'}</span></div></div>`).join('')}</div></div>`;
    }

    const meta = sortItems(items().filter((i) => i.cat === 'misc'));
    if (meta.length) out += `<div class="group"><div class="label"><span>Metadata</span><span>${meta.length}</span></div><div class="list">${meta.map((i) => rowHTML(i, false)).join('')}</div></div>`;
    return out;
  }

  function serviceOf(u) {
    let url;
    try { url = new URL(u); } catch { return { label: '', path: u }; }
    const same = url.origin === location.origin;
    const path = url.pathname + url.search;
    let m;
    if (/\.supabase\.(?:co|in)$/.test(url.hostname)) {
      if ((m = /^\/rest\/v1\/([\w-]+)/.exec(url.pathname))) return { label: 'Supabase table: ' + m[1], path, c: '#06b6d4' };
      if ((m = /^\/auth\/v1\/([\w-]+)/.exec(url.pathname))) return { label: 'Supabase Auth: ' + m[1], path, c: '#06b6d4' };
      if ((m = /^\/functions\/v1\/([\w-]+)/.exec(url.pathname))) return { label: 'Supabase Edge Function: ' + m[1], path, c: '#06b6d4' };
      if (/^\/storage\/v1\//.test(url.pathname)) return { label: 'Supabase Storage', path, c: '#06b6d4' };
      return { label: 'Supabase', path, c: '#06b6d4' };
    }
    if (/\/a-4-a\/c\.js|\/c\.js\?i=/.test(u)) return { label: 'Vercel BotID challenge', path, c: '#22c55e' };
    if (/google-analytics\.com|analytics\.google\.com|\/g\/collect/.test(u)) return { label: 'Google Analytics hit', path, c: '#f59e0b' };
    if (/\/_vercel\/(?:insights|speed-insights)/.test(u)) return { label: 'Vercel Analytics', path, c: '#f59e0b' };
    if (same && /^\/(?:api|trpc|graphql|_actions|wp-json)\b/.test(url.pathname)) return { label: 'API route', path, c: '#f43f5e', api: true };
    if (same) return { label: /\.json$/.test(url.pathname) ? 'Data file' : 'Same origin', path };
    return { label: url.host, path: url.host + path };
  }

  function activityHTML() {
    const a = state.activity;
    let out = '';
    if (!state.watch && !a.length) return '<div class="empty">Turn on Watch (the eye button) to log network calls and form submits live.</div>';
    if (state.watch) out += `<div class="label"><span>Since ${esc(fmtTime(state.watchSince))}</span><span>${a.length}</span></div>`;
    if (!a.length) return out + '<div class="empty">Waiting for activity. Submit a form or click around.</div>';
    out += '<div class="list">' + a.map((x) => {
      const id = 'act:' + x.n;
      const open = state.expanded.has(id);
      const svc = x.kind === 'submit' ? { label: 'Form submit', path: x.path, c: '#8b5cf6' } : serviceOf(x.url);
      const ok = x.status == null ? '' : x.status >= 200 && x.status < 400 ? 'cat' : 'risk';
      const status = x.kind === 'submit' ? '' : `<span class="badge ${ok || 'outline'}" style="--c:#16a34a">${x.status == null ? 'sent' : x.status || 'failed'}</span>`;
      let detail = '';
      if (open) {
        detail = '<div class="ev mono">';
        if (x.url) detail += `<div class="ln"><span class="t">URL</span><span class="v">${esc(x.url)}</span></div>`;
        detail += `<div class="ln"><span class="t">SERVICE</span><span class="v">${esc(svc.label)}</span></div>`;
        if (x.via) detail += `<div class="ln"><span class="t">VIA</span><span class="v">${esc(x.via)}${x.ms ? ` · ${x.ms} ms` : ''}</span></div>`;
        if (x.fields && x.fields.length) detail += `<div class="ln"><span class="t">FIELDS</span><span class="v">${x.fields.map(esc).join(', ')}</span></div>`;
        if (x.type) detail += `<div class="ln"><span class="t">RETURNS</span><span class="v">${esc(x.type)}</span></div>`;
        if (svc.api) detail += '<div class="note">Whatever this route does on the server (email, database, payments) stays out of the browser\'s view.</div>';
        detail += '</div>';
      }
      return `<div class="item${open ? ' open' : ''}" style="--c:${svc.c || '#a1a1aa'}"><button class="row" data-act="row" data-id="${id}">
<span class="badge secondary mono">${esc(x.method || 'GET')}</span><span class="nm mono" style="font-size:12px;font-weight:500" title="${esc(x.url || x.path)}">${esc(clip(svc.path || x.path, 46))}</span><span class="sp"></span>${status}<span class="chev">${I.chevron}</span></button>
${open ? `<div class="detail"><div class="sub"><span class="badge cat">${esc(svc.label)}</span><span class="via">${esc(fmtClock(x.at))}</span></div>${detail}</div>` : ''}</div>`;
    }).join('') + '</div>';
    return out;
  }

  function searchHTML() {
    const f = state.found;
    const o = state.opts;
    const box = (key, label) => `<span class="check ${o[key] ? 'on' : ''}" data-act="opt" data-opt="${key}" role="checkbox" aria-checked="${o[key]}"><span class="box">${I.check}</span>${label}</span>`;
    let out = `<form class="field" data-form="search"><input class="input mono" name="q" placeholder="Search source code…" value="${esc(state.q)}" spellcheck="false" autocomplete="off"><button class="btn-primary" type="submit">Search</button></form>
<div class="checks">${box('caseSensitive', 'Case')}${box('wholeWord', 'Whole word')}${box('regex', 'Regex')}</div>`;
    if (!state.result) return out + '<div class="empty">Run a scan first.</div>';
    if (!f) return out + `<div class="empty">Searches the HTML plus ${state.result.page.code.files} JS/CSS files (${kb(state.result.page.code.jsBytes + state.result.page.code.cssBytes)}).</div>`;
    if (f.error) return out + `<div class="alert warn" style="margin-top:10px">${I.alert}<div>${esc(f.error)}</div></div>`;
    if (!f.results.length) return out + `<div class="empty">No matches in ${f.files} files.</div>`;
    const byFile = new Map();
    for (const h of f.results) { if (!byFile.has(h.file)) byFile.set(h.file, []); byFile.get(h.file).push(h); }
    out += `<div class="label" style="margin-top:8px"><span>${f.total.toLocaleString()} match${f.total === 1 ? '' : 'es'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}${f.total > f.results.length ? ` · showing ${f.results.length}` : ''}</span></div><div class="list hits">`;
    for (const [file, hits] of byFile) {
      out += `<div class="hitfile">${I.file}<span>${esc(clip(short(file), 90))}</span></div>`;
      out += hits.map((h) => `<div class="hit mono"><span class="ctx">${esc(h.before)}</span><mark>${esc(h.match)}</mark><span class="ctx">${esc(h.after)}</span></div>`).join('');
    }
    return out + '</div>';
  }

  // ── scan ───────────────────────────────────────────────────────────────
  async function rescan({ auto = false } = {}) {
    if (state.scanning) { if (auto) scheduleLate(); return; }
    state.scanning = true;
    render();
    let globals = {};
    try {
      const res = await chrome.runtime.sendMessage({ type: 'deetz:globals', paths: DeetzDetect.jsPaths() });
      state.globalsOk = !!(res && res.ok);
      globals = (res && res.globals) || {};
    } catch { state.globalsOk = false; }

    let result;
    try { result = await DeetzDetect.scan({ globals }); } catch (err) {
      console.warn('[Deetz] scan failed', err);
      state.scanning = false; render(); return;
    }

    // Compare against the previous visit, captured once when the panel first scans, so
    // things that load late (GTM, GA, chat widgets) aren't reported as "gone".
    if (state.baseline === undefined) {
      const o = await chrome.storage.local.get(LAST_KEY).catch(() => ({}));
      state.baseline = o[LAST_KEY] || null;
    }
    const prev = state.baseline;
    const before = state.result ? new Set(state.result.items.map((i) => i.id)) : null;
    const late = before ? result.items.filter((i) => !before.has(i.id) && i.cat !== 'packages') : [];
    if (prev) {
      const now = new Set(result.items.map((i) => i.id));
      state.diff = {
        since: prev.at,
        added: result.items.filter((i) => !(i.id in prev.names)).map((i) => i.id),
        removed: Object.entries(prev.names).filter(([id]) => !now.has(id)).map(([id, name]) => ({ id, name })),
      };
    }
    state.result = result;
    state.scanning = false;
    if (late.length) flash(`Found ${late.length} more: ${late.slice(0, 3).map((i) => i.name).join(', ')}${late.length > 3 ? '…' : ''}`, 4000);
    if (state.q) state.found = DeetzDetect.search(state.q, state.opts);
    chrome.storage.local.set({ [LAST_KEY]: { at: result.at, names: Object.fromEntries(result.items.map((i) => [i.id, i.name])) } });
    chrome.runtime.sendMessage({ type: 'deetz:badge', count: result.items.length }).catch(() => {});
    render();
  }

  // ── late loads ─────────────────────────────────────────────────────────
  // Tag managers, analytics and widgets often arrive seconds after the page. While the panel
  // is open, any newly added script / stylesheet / iframe triggers a quiet rescan. Deetz's own
  // file reads are fetch() calls, which this ignores, so it can't loop on itself.
  let lateObs = null, lateMO = null, lateTimer = null, lastLate = 0;
  function scheduleLate() {
    if (!state.visible || state.watch) return; // Watch mode already rescans on every change
    clearTimeout(lateTimer);
    lateTimer = setTimeout(() => { lastLate = Date.now(); rescan({ auto: true }); }, Math.max(1200, 3000 - (Date.now() - lastLate)));
  }
  function startLate() {
    if (lateMO) return;
    try {
      lateObs = new PerformanceObserver((list) => {
        if (list.getEntries().some((e) => ['script', 'link', 'css', 'iframe'].includes(e.initiatorType))) scheduleLate();
      });
      lateObs.observe({ type: 'resource' });
    } catch { lateObs = null; }
    lateMO = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && /^(?:SCRIPT|LINK|IFRAME|STYLE|NOSCRIPT)$/.test(n.nodeName) && n !== host) return scheduleLate();
      }
    });
    lateMO.observe(document.documentElement, { childList: true, subtree: true });
  }
  function stopLate() {
    lateObs && lateObs.disconnect(); lateObs = null;
    lateMO && lateMO.disconnect(); lateMO = null;
    clearTimeout(lateTimer);
  }

  // ── watch mode ─────────────────────────────────────────────────────────
  let observer = null, hrefTimer = null, debounce = null, lastHref = location.href, lastWatchScan = 0;
  function schedule() {
    clearTimeout(debounce);
    debounce = setTimeout(() => { lastWatchScan = Date.now(); rescan(); }, Math.max(1500, 4000 - (Date.now() - lastWatchScan)));
  }
  let actN = 0;
  function logActivity(x) {
    state.activity.unshift({ n: ++actN, at: Date.now(), ...x });
    if (state.activity.length > 200) state.activity.length = 200;
    if (!state.visible || state.min) return render();
    const tab = wrap.querySelector('.trigger[data-tab="activity"] .n');
    if (tab) tab.textContent = state.activity.length; else render();
    if (state.tab === 'activity') renderBody();
  }
  const onNet = (ev) => {
    let d;
    try { d = JSON.parse(ev.detail); } catch { return; }
    if (!d || !d.url || /^(?:data|blob|chrome-extension):/.test(d.url)) return;
    logActivity({ kind: 'net', ...d });
  };
  const onSubmit = (ev) => {
    const f = ev.target;
    if (!(f instanceof HTMLFormElement)) return;
    const fields = [...new Set([...f.elements].map((el) => el.name || el.id).filter(Boolean))].slice(0, 20);
    const action = f.getAttribute('action') || location.pathname;
    logActivity({ kind: 'submit', method: (f.getAttribute('method') || 'GET').toUpperCase(), path: action, url: new URL(action, location.href).href, fields });
  };
  function setWatch(on) {
    state.watch = on;
    if (on) {
      state.watchSince = Date.now();
      document.addEventListener('deetz:net', onNet);
      document.addEventListener('submit', onSubmit, true);
      chrome.runtime.sendMessage({ type: 'deetz:nethook' }).catch(() => {});
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      lastHref = location.href;
      hrefTimer = setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; schedule(); } }, 800);
    } else {
      document.removeEventListener('deetz:net', onNet);
      document.removeEventListener('submit', onSubmit, true);
      observer && observer.disconnect();
      clearInterval(hrefTimer);
      clearTimeout(debounce);
    }
    render();
  }

  // ── export ─────────────────────────────────────────────────────────────
  function toMarkdown(r) {
    const lines = ['## Web Application Specifications', '', `**${r.host}**, scanned ${new Date(r.at).toLocaleString()} with Deetz ${VERSION}`, ''];
    for (const [cat, label] of CATS) {
      const g = r.items.filter((i) => i.cat === cat);
      if (!g.length) continue;
      lines.push(`### ${label}`);
      for (const i of g) {
        const extra = [...i.tags, ...i.via.map((v) => 'via ' + v)];
        lines.push(`- ${i.name}${i.version ? ' · ' + i.version : i.label ? ' · ' + i.label : ''}${extra.length ? ` (${extra.join(', ')})` : ''}${i.implied ? ' _implied_' : i.likely ? ' _likely_' : ''}`);
      }
      lines.push('');
    }
    if (r.page.api.routes.length) lines.push('### API routes', ...r.page.api.routes.map((x) => `- \`${x.path}\``), '');
    return lines.join('\n');
  }
  function toJSON(r) {
    return JSON.stringify({
      tool: 'Deetz', version: VERSION, url: r.url, scannedAt: new Date(r.at).toISOString(),
      technologies: r.items.map((i) => ({
        name: i.name, category: i.catLabel, version: i.version || i.label, tags: i.tags, via: i.via,
        confidence: i.implied ? 'implied' : i.likely ? 'likely' : 'confirmed',
        evidence: i.evidence.map((e) => ({ type: e.type, value: e.value })),
      })),
      page: r.page,
    }, null, 2);
  }
  let toastTimer = null;
  function flash(msg, ms = 1600) {
    state.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = null; render(); }, ms);
  }

  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text; root.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    state.menu = false;
    flash(`Copied ${label}`);
    render();
  }

  // ── events ─────────────────────────────────────────────────────────────
  let dragMoved = false;
  wrap.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) { if (state.menu && !ev.target.closest('.menu')) { state.menu = false; render(); } return; }
    const act = el.dataset.act;
    if (act === 'expand') { if (dragMoved) return; state.min = false; saveUI(); render(); return; }
    if (act === 'rescan') return rescan();
    if (act === 'watch') { setWatch(!state.watch); if (state.watch) { state.tab = 'activity'; render(); } return; }
    if (act === 'theme') { state.theme = { system: 'light', light: 'dark', dark: 'system' }[state.theme]; saveUI(); return render(); }
    if (act === 'copy') { state.menu = !state.menu; return render(); }
    if (act === 'copy-md' && state.result) return copy(toMarkdown(state.result), 'Markdown');
    if (act === 'copy-json' && state.result) return copy(toJSON(state.result), 'JSON');
    if (act === 'min') { state.min = true; state.menu = false; saveUI(); return render(); }
    if (act === 'close') return hide();
    if (act === 'tab') {
      state.tab = el.dataset.tab; state.menu = false; saveUI(); render();
      if (state.tab === 'search') wrap.querySelector('.input')?.focus();
      return;
    }
    if (act === 'opt') {
      const k = el.dataset.opt;
      state.opts[k] = !state.opts[k];
      if (state.q) state.found = DeetzDetect.search(state.q, state.opts);
      renderBody();
      return;
    }
    if (act === 'row') {
      const id = el.dataset.id;
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      const body = wrap.querySelector('.body');
      const scroll = body.scrollTop;
      renderBody();
      body.scrollTop = scroll;
    }
  });

  wrap.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = ev.target.querySelector('input');
    state.q = input.value.trim();
    state.found = state.q ? DeetzDetect.search(state.q, state.opts) : null;
    renderBody();
    const again = wrap.querySelector('.input');
    if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
  });
  // Keep the site's keyboard shortcuts from firing while typing in Deetz.
  ['keydown', 'keyup', 'keypress'].forEach((t) => wrap.addEventListener(t, (ev) => ev.stopPropagation()));

  wrap.addEventListener('pointerdown', (ev) => {
    const grip = ev.target.closest('[data-resize]');
    if (grip) {
      ev.preventDefault();
      const mode = grip.dataset.resize;
      const panel = wrap.querySelector('.panel');
      const r = panel.getBoundingClientRect();
      const sx = ev.clientX, sy = ev.clientY;
      const start = { w: r.width, h: r.height, bottom: state.pos.bottom };
      panel.classList.add('resizing');
      const move = (e) => {
        let w = start.w, h = start.h;
        // Anchored bottom-right: growing down moves the bottom edge, growing left widens it.
        if (mode.includes('b')) h = Math.min(start.h + (e.clientY - sy), start.h + start.bottom - 4);
        if (mode.includes('l')) w = start.w - (e.clientX - sx);
        w = Math.max(MIN_W, Math.min(w, innerWidth - state.pos.right - 4));
        h = Math.max(MIN_H, h);
        state.size = { w: Math.round(w), h: Math.round(h) };
        state.pos.bottom = start.bottom - (h - start.h);
        panel.style.cssText = sizeStyle();
        wrap.style.bottom = state.pos.bottom + 'px';
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        panel.classList.remove('resizing');
        place();
        saveUI();
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
      return;
    }
    const handle = ev.target.closest('[data-drag]');
    if (!handle || (ev.target.closest('button') && !ev.target.closest('.pill'))) return;
    const sx = ev.clientX, sy = ev.clientY, start = { ...state.pos };
    dragMoved = false;
    const move = (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragMoved && Math.hypot(dx, dy) < 4) return;
      dragMoved = true;
      state.pos = { right: start.right - dx, bottom: start.bottom - dy };
      place();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      if (dragMoved) saveUI();
      setTimeout(() => { dragMoved = false; }, 0);
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  });
  wrap.addEventListener('dblclick', (ev) => {
    if (!ev.target.closest('[data-resize]')) return;
    state.size = null; saveUI(); render();
  });
  addEventListener('resize', () => state.visible && place());

  function show() { mount(); state.visible = true; render(); rescan(); startLate(); }
  // Re-raise above anything the page opens later in the top layer (e.g. a <dialog>).
  document.addEventListener('toggle', (ev) => { if (ev.target !== host && ev.newState === 'open' && state.visible && usePopover) { try { host.hidePopover(); host.showPopover(); } catch { /* ignore */ } } }, true);
  function hide() { state.visible = false; state.menu = false; setWatch(false); stopLate(); render(); }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'deetz:toggle') return;
    if (!state.visible) show();
    else if (state.min) { state.min = false; saveUI(); render(); }
    else hide();
  });
})();
