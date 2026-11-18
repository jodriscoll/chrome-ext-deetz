# Chrome Web Store submission kit

Everything needed to fill in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) for Deetz. Copy each field as written.

## Package

```bash
npm test && npm run package    # → dist/deetz-<version>.zip
```

Upload `dist/deetz-<version>.zip` under **Package**. It contains only `manifest.json`, `src/`, `icons/` and `LICENSE`.

## Store listing tab

**Name**
```
Deetz
```

**Summary** (132 characters max; this is the manifest `description`)
```
See the CMS, frameworks, plugins and hosting behind any page, with the evidence.
```

**Category:** Developer Tools  
**Language:** English (United States)

**Description**
```
Deetz is a compact panel that shows what any website is built with, and why it thinks so.

Click the Deetz icon (or press Alt+Shift+D) on any page. A small, draggable panel opens with everything Deetz found, sorted into tabs: Stack, Plugins, Services, Hosting, Security, Page and Activity. Open any row to see the evidence: the exact file, header, selector, cookie or code signature that matched, and where the version number came from.

WHAT IT DETECTS
• CMSs: WordPress, Craft CMS, Drupal, Joomla, Ghost, Strapi, Payload, Directus, Webflow, Squarespace, Shopify, and more
• Every WordPress plugin and theme, even ones no signature list knows, with versions, the theme's real name and author, and must-use plugins
• Headless content and data sources: Supabase, Sanity, Contentful, Storyblok, Prismic, DatoCMS, Firebase, Cloudinary
• Frameworks: Next.js (App Router or Pages Router), Nuxt, Remix, SvelteKit, Astro, Expo and React Native Web, Angular, Vue, React, htmx, Alpine
• Libraries found inside the site's own JavaScript bundles, with versions: supabase-js, React DOM, Reanimated, Zod, Redux, TanStack, Axios, Sentry and more
• How the code was built: JavaScript language level (ES2015 to ES2022+), ES modules, Metro, webpack, Vite or Turbopack, and TypeScript or npm packages when source maps are published
• Fonts actually in use, with weights and whether they're self-hosted, Google Fonts or Adobe Fonts
• Analytics, tag managers (with container IDs), marketing pixels, chat widgets and embeds
• Hosting and CDN (Vercel, Netlify, Cloudflare, WP Engine, Kinsta…), server and runtime, security headers, bot protection and consent tools
• API routes the page calls, and the services its code talks to

WHY DEETZ
• Evidence for everything. No black box: open any item to see exactly what matched.
• Provenance. "jQuery 3.3.1 via ajax.googleapis.com", "LazySizes via EWWW Image Optimizer": see what loaded each library.
• Honest about limits. Things that only run on a server (an email provider behind an API route, a database) can't be seen from a browser, and Deetz says so instead of guessing.
• Catches late loaders. Tag managers and widgets that load after the page are picked up automatically while the panel is open.
• Watch mode logs network calls and form submits live, with field names only, never values.
• Search the page's HTML and every JavaScript and CSS file it loaded, with case, whole-word and regex options.
• New and gone: see what changed on a site since your last visit.
• Copy the results as Markdown or JSON.
• Light and dark themes, a resizable panel that remembers its place, and a toolbar icon that follows Chrome's theme.

PRIVATE BY DESIGN
Deetz runs only when you click it. It has no servers, no analytics and no accounts. Everything is analyzed inside your browser, and nothing is sent to the developer or anyone else. The only permissions are activeTab, scripting and storage.

Open source: https://github.com/jodriscoll/chrome-ext-deetz
```

**Graphic assets** (all in [`docs/store`](store))

| Field | File | Size |
|---|---|---|
| Store icon | `icons/icon-128.png` | 128 × 128 (96 px artwork + 16 px padding) |
| Screenshot 1 | `docs/store/screenshot-1-all.png` | 1280 × 800 |
| Screenshot 2 | `docs/store/screenshot-2-plugins.png` | 1280 × 800 |
| Screenshot 3 | `docs/store/screenshot-3-activity.png` | 1280 × 800 |
| Screenshot 4 | `docs/store/screenshot-4-search.png` | 1280 × 800 |
| Screenshot 5 | `docs/store/screenshot-5-page.png` | 1280 × 800 |
| Small promo tile | `docs/store/promo-small-440x280.png` | 440 × 280 |
| Marquee promo tile | `docs/store/promo-marquee-1400x560.png` | 1400 × 560 |

Regenerate them any time with `node scripts/store-assets.mjs`.

**Additional fields**

| Field | Value |
|---|---|
| Official URL | (optional) your verified site, for example `https://jodriscoll.com` |
| Homepage URL | `https://github.com/jodriscoll/chrome-ext-deetz` |
| Support URL | `https://github.com/jodriscoll/chrome-ext-deetz/issues` |
| Mature content | No |

## Privacy practices tab

**Single purpose**
```
Deetz has one purpose: to show the user which technologies the current web page is built with (CMS, frameworks, libraries, plugins, hosting, analytics and similar), together with the evidence for each detection.
```

**Permission justifications**

`activeTab`
```
Deetz reads the current tab only after the user clicks the toolbar icon or presses the keyboard shortcut. activeTab grants that temporary access to the one tab the user chose, instead of requesting access to all websites.
```

`scripting`
```
Used to inject the Deetz panel and its detection code into the tab the user activated, and to read which JavaScript libraries the page defines (for example window.jQuery and its version), which requires running a small function in the page's own context. When the user turns on Watch mode, the same permission installs a passive observer of the page's network calls so they can be listed in the Activity tab; requests pass through unchanged and only field names are reported.
```

`storage`
```
Stores the panel's position, size, theme and last-used tab, and for each scanned site the list of detected technology names, so Deetz can show what is new or gone on the next visit. Data stays in chrome.storage.local on the user's device.
```

**Host permissions:** none requested.

**Remote code**
```
No, I am not using remote code. All JavaScript Deetz executes is included in the extension package.
```

**Data usage.** Deetz does not collect or transmit user data: everything is processed locally and nothing leaves the browser. In the form, leave every data category **unchecked** (Personally identifiable information, Health, Financial and payment, Authentication, Personal communications, Location, Web history, User activity, Website content).

Then check all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**
```
https://github.com/jodriscoll/chrome-ext-deetz/blob/main/docs/PRIVACY.md
```
(Or publish [`docs/PRIVACY.md`](PRIVACY.md) on your own site and use that address.)

## Distribution tab

- **Visibility:** Public (or Unlisted to share a link before a wider launch).
- **Regions:** All regions.
- **Pricing:** Free.

## Before you submit

- [ ] Developer account registered (one-time registration fee) with 2-Step Verification on, and a verified contact email.
- [ ] Repository pushed so the privacy policy URL resolves.
- [ ] `manifest.json` and `package.json` versions match, and `CHANGELOG.md` has an entry for that version.
- [ ] `npm test` passes and `npm run package` builds the zip.
- [ ] Loaded the zip contents unpacked one last time and scanned a few real sites.

Reviews are usually done within a few days, but can take longer for new developer accounts. Each later update goes through review again.
