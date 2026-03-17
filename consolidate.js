export async function consolidateTabs(chromeApi, currentWindowId) {
  const ghTabs = await chromeApi.tabs.query({ url: "https://github.com/*" });
  if (ghTabs.length === 0) return;

  // Deduplicate by URL — keep first occurrence
  const seen = new Map();
  const duplicateIds = [];
  for (const tab of ghTabs) {
    if (seen.has(tab.url)) {
      duplicateIds.push(tab.id);
    } else {
      seen.set(tab.url, tab);
    }
  }

  // Deduplicate PR tabs — collapse /pull/123/* into /pull/123
  const prPattern = /^(https:\/\/github\.com\/.+\/pull\/\d+)(\/.*)?$/;
  const prGroups = new Map();
  for (const [url, tab] of seen) {
    const match = url.match(prPattern);
    if (match) {
      const baseUrl = match[1];
      if (!prGroups.has(baseUrl)) prGroups.set(baseUrl, []);
      prGroups.get(baseUrl).push({ tab, hasSubpath: !!match[2] });
    }
  }
  for (const [baseUrl, entries] of prGroups) {
    if (entries.length === 1 && !entries[0].hasSubpath) continue;
    const base = entries.find((e) => !e.hasSubpath);
    if (base) {
      // Keep the base tab, close all sub-path tabs
      for (const e of entries) {
        if (e !== base) {
          duplicateIds.push(e.tab.id);
          seen.delete(e.tab.url);
        }
      }
    } else {
      // No base tab exists — navigate the first tab to the base URL, close the rest
      const [keep, ...rest] = entries;
      await chromeApi.tabs.update(keep.tab.id, { url: baseUrl });
      seen.delete(keep.tab.url);
      seen.set(baseUrl, keep.tab);
      for (const e of rest) {
        duplicateIds.push(e.tab.id);
        seen.delete(e.tab.url);
      }
    }
  }

  if (duplicateIds.length > 0) {
    await chromeApi.tabs.remove(duplicateIds);
  }

  // Sort unique tabs by URL
  const uniqueTabs = [...seen.values()].sort((a, b) =>
    a.url.localeCompare(b.url)
  );

  // Collect window IDs that had GitHub tabs (excluding current window)
  const affectedWindowIds = new Set(
    ghTabs
      .filter((t) => t.windowId !== currentWindowId)
      .map((t) => t.windowId)
  );

  // Move all unique tabs to current window in sorted order
  const tabIdsToMove = uniqueTabs.map((t) => t.id);
  if (tabIdsToMove.length > 0) {
    await chromeApi.tabs.move(tabIdsToMove, {
      windowId: currentWindowId,
      index: -1,
    });
  }

  // Close any windows that are now empty
  for (const windowId of affectedWindowIds) {
    try {
      const remaining = await chromeApi.tabs.query({ windowId });
      if (remaining.length === 0) {
        await chromeApi.windows.remove(windowId);
      }
    } catch {
      // Window may already be closed
    }
  }
}
