# GitHub Tabs

A Chrome extension that consolidates all GitHub tabs into the current window, deduplicates them, sorts them by URL, and closes duplicate non-GitHub tabs.

## Features

- **Consolidate** — Moves all GitHub tabs from every window into the current one
- **Deduplicate** — Removes duplicate tabs (same URL), keeping only the first occurrence
- **Sort** — Arranges the consolidated tabs alphabetically by URL
- **Clean up** — Closes windows left empty after tabs are moved
- **Deduplicate other tabs** — Closes duplicate non-GitHub tabs (exact same URL) in the current window, keeping the left-most copy

## Install

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the repo directory

## Usage

Click the extension icon in the toolbar. All GitHub tabs across all windows will be moved into the current window, deduplicated, sorted, and grouped. Duplicate non-GitHub tabs in the current window are then closed (the right-most copy is closed, the left-most is kept).

Right-click the extension icon for more options:

- **Group by PRs** / **Group by repo name** — choose how GitHub tabs are grouped
- **Deduplicate now** — close duplicate non-GitHub tabs in the current window only, without consolidating or grouping GitHub tabs

## Development

Use Node.js 24.7.0, the version pinned in `package.json`, or a newer supported Node.js release. Tests run with Vitest 5.

```sh
npm ci
npm test
npm run build:bundle
```

For watch mode, run `npm test -- --watch`.

## Publishing

Publishing is manual, so pushing to `main` never releases anything. To release what's on `origin/main`, either:

- run `bin/publish.sh`, which shows the shipped changes since the last release, asks for confirmation, starts the workflow and follows it until it finishes, or
- open **Actions → Publish Chrome extension → Run workflow** on github.com and run it on `main`.

The workflow (`.github/workflows/publish-chrome-extension.yml`) installs dependencies, runs the tests, packages the extension into `dist/github-tabs.zip`, uploads it to the Chrome Web Store, submits it for review, and then tags the released commit `v<version>`. Google usually reviews it within a day, and it goes live automatically once approved.

Each run publishes version `<major>.<minor>.<run number>`, taking `<major>.<minor>` from `manifest.json`, because the Chrome Web Store requires a higher version on every upload. To bump the major or minor version, edit `manifest.json`.

Before using it, add these repository secrets:

- `CHROME_EXTENSION_ID`
- `CHROME_EXTENSION_CLIENT_ID`
- `CHROME_EXTENSION_CLIENT_SECRET`
- `CHROME_EXTENSION_REFRESH_TOKEN`

To set them up (or replace an expired refresh token), run the interactive wizard. It walks you through the Chrome Web Store, Google Cloud and OAuth Playground steps, verifies the credentials with Google, and writes the secrets with `gh`:

```sh
bin/dev/setup-chrome-web-store.sh
```
