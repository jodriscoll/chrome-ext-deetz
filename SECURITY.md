# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private reporting instead: [Report a vulnerability](https://github.com/jodriscoll/chrome-ext-deetz/security/advisories/new).

Include the Deetz version, your Chrome version, the page or steps that trigger the issue, and what you expected to happen. You should get a reply within a week.

## Scope

Things worth reporting:

- A page that can run code in the extension's context, read Deetz's storage, or trigger privileged extension APIs.
- HTML or script injection into the Deetz panel from page content (all page-derived text is supposed to be escaped).
- Anything that causes Deetz to send data off the device, or to show form field **values** in the Activity tab.

## Design notes

- Deetz requests only `activeTab`, `scripting` and `storage`. It has no host permissions and runs only after a user gesture.
- The panel lives in a closed Shadow DOM. Every string taken from the page is HTML-escaped before rendering.
- No remote code: everything Deetz executes ships in the package.
- In Watch mode, Deetz wraps the page's `fetch`, `XMLHttpRequest` and `sendBeacon` to observe calls. It reports field names only and passes every request through unchanged.
