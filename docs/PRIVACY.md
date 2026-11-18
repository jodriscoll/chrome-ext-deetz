# Deetz privacy policy

_Last updated: November 18, 2026_

Deetz is a Chrome extension that shows which technologies a web page is built with. This policy explains what it reads, what it stores, and what it sends. The short version: **Deetz has no servers, collects nothing, and sends nothing to its developer or to any third party.**

## What Deetz reads

Deetz only runs on a tab when you click its toolbar icon or press its keyboard shortcut. It then reads, inside your browser:

- The page's HTML, meta tags, and the addresses of the scripts, styles, images, fonts, and network requests the page loaded.
- The names (not the values) of the page's cookies.
- Which JavaScript globals exist on the page (for example, whether `window.jQuery` is defined, and its version).
- The fonts the page has loaded.

All of this is analyzed locally, inside the extension, and displayed in the Deetz panel.

## Network requests Deetz makes

To read details the page itself doesn't expose, Deetz makes a few requests **to the site you are viewing**, from your browser:

- It requests the current page again to read its response headers (for example, `server` or `strict-transport-security`).
- It downloads the page's own JavaScript and CSS files, and a WordPress theme's `style.css`, to look for library signatures and version banners. It also fetches source maps that the site itself publishes.
- For a few public CDNs that allow it (for example, jsDelivr, unpkg, cdnjs), it downloads the same JavaScript and CSS files the page already loaded.

These are the same files your browser already downloads when it shows the page. Requests to the site's own origin include your normal cookies for that site, exactly like the page's own requests. Nothing is sent to the developer of Deetz or to anyone else.

## Watch mode and Activity

If you turn on **Watch**, Deetz also records the network calls and form submissions the page makes while the panel is open, and shows them in the Activity tab: the method, address, status code, timing, and the **names** of the fields sent in JSON or form bodies. **Field values are never displayed or stored.** This log exists only in the open panel and is discarded when you close it or leave the page.

## What Deetz stores

Deetz uses `chrome.storage.local`, which stays on your device and is not synced:

- Panel preferences: position, size, theme, last-used tab, and whether the panel was minimized.
- For each site you scan, the list of technology names it found and the time of the scan, so it can show what's new or gone the next time you scan that site.
- Whether your browser is in light or dark mode, to pick the matching toolbar icon.

Deetz does not store page content, addresses you visited (other than the site's hostname as the key for its last scan), form data, or anything typed on a page.

You can delete all of it at any time by removing the extension from `chrome://extensions`.

## Clipboard

Deetz writes to your clipboard only when you choose **Copy as Markdown** or **Copy as JSON**. It never reads your clipboard.

## What Deetz does not do

- No analytics, telemetry, crash reporting, or tracking of any kind.
- No accounts, no ads, no remote code. Everything Deetz runs ships inside the extension package.
- No selling, sharing, or transferring of data, because no data leaves your browser.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Lets Deetz read the current tab only after you click its icon. Access ends when the tab navigates away. |
| `scripting` | Injects the Deetz panel and detection code into that tab, and reads which JavaScript libraries the page defines. |
| `storage` | Saves the panel preferences and per-site scan history described above, on your device. |

## Changes

If this policy changes, the new version will be published at this address with a new date, and noted in the project's [CHANGELOG](../CHANGELOG.md).

## Contact

Questions or concerns: open an issue at [github.com/jodriscoll/chrome-ext-deetz/issues](https://github.com/jodriscoll/chrome-ext-deetz/issues).
