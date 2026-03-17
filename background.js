chrome.action.onClicked.addListener(async (activeTab) => {
  const currentWindowId = activeTab.windowId;

  const ghTabs = await chrome.tabs.query({ url: "https://github.com/*" });
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

  if (duplicateIds.length > 0) {
    await chrome.tabs.remove(duplicateIds);
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
    await chrome.tabs.move(tabIdsToMove, {
      windowId: currentWindowId,
      index: -1,
    });
  }

  // Close any windows that are now empty
  for (const windowId of affectedWindowIds) {
    try {
      const remaining = await chrome.tabs.query({ windowId });
      if (remaining.length === 0) {
        await chrome.windows.remove(windowId);
      }
    } catch {
      // Window may already be closed
    }
  }
});
