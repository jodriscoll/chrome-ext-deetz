# Contributing to Deetz

Thanks for helping Deetz recognize more of the web. The most valuable contributions are new or better **detection rules**, each backed by a test.

## Setup

```bash
git clone git@github.com:jodriscoll/chrome-ext-deetz.git
cd chrome-ext-deetz
npm install
npx playwright install chromium
npm test
```

Load the extension for manual testing: `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick the repo folder. After editing, click ↻ on the Deetz card and reload the page you're testing.

There is no build step. The extension is plain JavaScript in `src/`.

## Adding or improving a rule

Rules live in [`src/rules.js`](src/rules.js). The format is documented at the top of that file. A typical rule:

```js
{ id: 'payload', name: 'Payload CMS', cat: 'cms', implies: ['node'],
  cookies: [/^payload-token$/],
  src: [/\/api\/media\/file\//],
  html: [weak(/payloadcms/i)] },
```

Guidelines:

- **Prefer specific signals.** A response header, a unique global, a vendor's asset host, or a string that only that library ships beats a generic class name.
- **Wrap guesses in `weak()`.** A rule that only matches weak signals is shown as "likely".
- **Capture versions** with a regex group, a `js` version path, or a `dom` `attr` when you can.
- **Bundle signatures** (`bundle:`) must survive minification: use string literals the library always ships (error messages, protocol strings, package names), not variable names.
- **WordPress plugins** are found automatically from their folder. Add a `wp(...)` entry only to give a proper name or fingerprint markup that survives asset combining.
- **No false positives on popular sites.** Before opening a PR, scan a few unrelated sites and make sure your rule doesn't fire.

## Tests

`npm test` loads the extension into Chromium, serves the fixture sites in [`tests/fixtures`](tests/fixtures) offline, and checks what Deetz detects. When you add a rule:

1. Add the smallest markup, header, or bundle snippet that triggers it to a fixture (or add a new fixture site in `tests/e2e.mjs`).
2. Add an expectation to `EXPECT` in `tests/e2e.mjs`.
3. Run `npm test` and make sure everything passes.

Fixtures must not contain real customer data: no real analytics IDs, API keys, project URLs, or client names.

## Code style

- Plain modern JavaScript, no dependencies at runtime, no remote code.
- 2-space indentation, single quotes, semicolons.
- The panel UI follows shadcn/ui's tokens and component anatomy. Reuse the existing CSS classes (`.badge`, `.btn`, `.list`, `.item`, `.row`, `.detail`, `.ev`) rather than adding one-off styles.
- Keep `chrome.*` APIs out of `src/detect.js` so the engine can run in any page.

## Pull requests

- One topic per PR, with a short description of what Deetz now detects or does and how you verified it.
- Update [`CHANGELOG.md`](CHANGELOG.md) under **Unreleased**.
- Do not bump the version; that happens at release time.

## Releasing (maintainers)

1. Move **Unreleased** entries in `CHANGELOG.md` under a new version and date.
2. Bump `version` in both `manifest.json` and `package.json` (they must match).
3. `npm test && npm run package`
4. Upload `dist/deetz-<version>.zip` in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
5. Tag the release: `git tag v<version> && git push --tags`.
