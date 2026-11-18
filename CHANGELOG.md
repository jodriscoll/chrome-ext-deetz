# Changelog

All notable changes to Deetz are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - November 18, 2026

### Added
- **Coverage more than doubled: 395 → 951 rules** across 20 categories. New: advertising and affiliate networks (with AdSense publisher IDs), 75+ Shopify apps by name, email-signup and marketing automation, personalization and A/B testing, reviews, support chat, search, forms, payments and buy-now-pay-later, accessibility overlays, consent APIs (IAB TCF, US Privacy, GPP, Google Consent Mode), bot protection, auth providers, error tracking, maps, media and social embeds, icon sets, UI kits, editors, charts, animation, state management, i18n, realtime and collaboration, API docs, AI/ML SDKs and client-side AI APIs, long-tail CMSs and site builders, AWS services, more servers, and site-verification tags.
- **Any Shopify app**, named or not: scripts on a Shopify store from hosts no rule recognizes are listed as Shopify apps.
- **Hostname detection** (`pagehost` matcher): `*.pages.dev`, `*.workers.dev`, `*.vercel.app`, `*.netlify.app`, `*.github.io`, `*.web.app`, `*.myshopify.com`, `*.lovable.app`, `*.replit.app`, `*.claude.site`, and more.
- New **Advertising & affiliate** and **AI & ML** categories.
- Store assets redesigned: page source in the background, a red scan beam across the frame, detection chips on the scanned lines, and headline-led screenshots.
- Repository and store readiness: README, privacy policy, contributing guide, third-party notices, MIT license.
- `npm test`: an end-to-end suite that loads the unpacked extension into Chromium and checks detections on WordPress, Next.js, Craft CMS, Shopify, Expo and kitchen-sink fixture sites, plus late-load detection and the Activity log (116 checks).
- `npm run package`: builds `dist/deetz-<version>.zip` for the Chrome Web Store with only the runtime files.
- `npm run icons`: re-renders every icon PNG from the SVG masters in `design/`.

### Changed
- The 128 px icon now has 16 px of transparent padding around 96 px of artwork, per Chrome Web Store guidelines.

### Fixed
- "ES modules" is now detected even when a page has very little JavaScript.
- Search results labeled the page's HTML "/%20%20(HTML)"; it now reads "Page HTML".

## [0.2.0] - November 18, 2026

### Added
- **Bundle analysis.** Deetz reads the page's own JavaScript and CSS files and finds libraries inside them: supabase-js and its version, React DOM's exact version, React Native Web, Reanimated, expo-image, AsyncStorage, Zod, Redux, Zustand, TanStack Query and Table, Axios, Sentry, PostHog, Firebase, Stripe, Clerk, Auth0, and more.
- **Language and build detection:** JavaScript language level (ES2015 to ES2022+, with the features found), ES modules, and the bundler (Metro, webpack, Vite, Turbopack, Babel output).
- **Source maps:** when a site publishes them, every npm package and the source language (TypeScript, Vue, Svelte, Astro, JSX, Sass, MDX) is listed.
- **Fonts in use** from `document.fonts`, with weights and whether each is self-hosted, from Google Fonts, or from Adobe Fonts.
- **Security headers** as their own items (HSTS with max-age, CSP directive count, X-Frame-Options, and others).
- **API routes** the page calls or its code references, and the hosts its code talks to. Vercel Functions, Vercel BotID and Envoy detection.
- **Supabase details from real traffic:** tables queried, Auth (signed in), Storage, Realtime and Edge Functions.
- **Activity tab (Watch mode):** live log of network calls and form submits with method, path, status, timing and field names (never values).
- **Late-load detection:** while the panel is open, scripts, stylesheets and iframes added later (tag managers, analytics, widgets) trigger a quiet rescan, and the footer says what was found.
- **Source code search** across the HTML and every file Deetz read, with Case, Whole word and Regex options.
- **Light and dark themes** (System / Light / Dark) and a resizable panel (bottom edge, left edge, corner; double-click to reset).
- **Toolbar icon** that follows Chrome's light or dark mode, and a count badge drawn into the icon in shadcn style.

### Changed
- New interface built on shadcn/ui's design system (neutral tokens, Tabs, Badge, Button, Input, Checkbox, Alert, DropdownMenu) with Lucide icons. Tabs: All, Stack, Plugins, Services, Hosting, Security, Page, Activity, with Search pinned on the right.
- Collapsed rows stay on one line; tags, "via" and evidence appear when a row is opened.
- "New" and "gone" are compared with your previous visit to the site, not with the previous scan, so late-loading tags aren't reported as gone.
- The panel sits in the browser's top layer, so page zoom, transforms or modals can't shift, clip or cover it.
- New icons: a scanner viewfinder over a browser window, as a Material-style toolbar glyph and a full-color icon.

### Fixed
- Toolbar icon paths failed to load from the service worker ("Failed to set icon").
- On Chrome pages that extensions can't access, Deetz no longer shows a "–" badge; the tooltip explains instead.

## [0.1.0] - November 17, 2026

### Added
- First version: a floating, draggable, minimizable "Web Application Specifications" panel in a closed Shadow DOM.
- About 360 detection rules across CMSs (WordPress, Craft CMS, Drupal, Ghost, Strapi, Payload, Directus and more), headless content sources, frameworks, libraries, UI kits, fonts, analytics, marketing tags, widgets, privacy tools, servers, hosting and build tools.
- Evidence for every detection: the URL, selector, header, cookie, global or file banner that matched, and where the version came from.
- Any WordPress plugin or theme detected from its folder, including must-use plugins and Bedrock layouts; the theme's real name, version and author from `style.css`.
- Provenance ("via Gravity Forms", "via WordPress core", "via ajax.googleapis.com").
- WordPress's own `?ver=` value is no longer reported as other assets' version.
- Watch mode, rescan, copy as Markdown or JSON, per-site new/gone tracking, and a signed-in WordPress notice.

[Unreleased]: https://github.com/jodriscoll/chrome-ext-deetz/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/jodriscoll/chrome-ext-deetz/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jodriscoll/chrome-ext-deetz/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jodriscoll/chrome-ext-deetz/releases/tag/v0.1.0
