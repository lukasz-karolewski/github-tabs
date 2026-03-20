# GitHub Tabs

A Chrome extension that consolidates all GitHub tabs into the current window, deduplicates them, and sorts them by URL.

## Features

- **Consolidate** — Moves all GitHub tabs from every window into the current one
- **Deduplicate** — Removes duplicate tabs (same URL), keeping only the first occurrence
- **Sort** — Arranges the consolidated tabs alphabetically by URL
- **Clean up** — Closes windows left empty after tabs are moved

## Install

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the repo directory

## Usage

Click the extension icon in the toolbar. All GitHub tabs across all windows will be moved into the current window, deduplicated, and sorted.

## Publishing

This repository includes a GitHub Actions workflow at `.github/workflows/publish-chrome-extension.yml` that packages and publishes the extension to the Chrome Web Store when a GitHub release is published or when the workflow is run manually.

Before using it, add these repository secrets:

- `CHROME_EXTENSION_ID`
- `CHROME_EXTENSION_CLIENT_ID`
- `CHROME_EXTENSION_CLIENT_SECRET`
- `CHROME_EXTENSION_REFRESH_TOKEN`

The workflow installs dependencies, runs the test suite, packages the extension into `dist/github-tabs.zip`, and then publishes that zip to the Chrome Web Store.
