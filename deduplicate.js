const GITHUB_URL_PREFIX = "https://github.com/";

// Close duplicate non-GitHub tabs in a window, keeping the left-most copy.
export async function deduplicateTabs(chromeApi, windowId) {
  const tabs = await chromeApi.tabs.query({ windowId });
  const ordered = [...tabs].sort((a, b) => a.index - b.index);

  const seen = new Set();
  const duplicateIds = [];
  for (const tab of ordered) {
    const url = tab.url || tab.pendingUrl;
    if (!url || url.startsWith(GITHUB_URL_PREFIX)) continue;
    if (seen.has(url)) {
      duplicateIds.push(tab.id);
    } else {
      seen.add(url);
    }
  }

  if (duplicateIds.length > 0) {
    await chromeApi.tabs.remove(duplicateIds);
  }
  return duplicateIds;
}
