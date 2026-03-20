export async function consolidateTabs(chromeApi, currentWindowId, { groupBy = "prs" } = {}) {
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
  const prUrls = new Set();
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
    prUrls.add(baseUrl);
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

  // Group tabs
  if (groupBy === "repo") {
    const repoPattern = /^https:\/\/github\.com\/[^/]+\/([^/]+)/;
    const repoGroups = new Map();
    for (const tab of uniqueTabs) {
      const match = tab.url.match(repoPattern);
      if (match) {
        const repoName = match[1];
        if (!repoGroups.has(repoName)) repoGroups.set(repoName, []);
        repoGroups.get(repoName).push(tab.id);
      }
    }
    const colors = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
    let colorIndex = 0;
    for (const [repoName, tabIds] of repoGroups) {
      const existingGroups = await chromeApi.tabGroups.query({
        title: repoName,
        windowId: currentWindowId,
      });
      const openGroup = existingGroups.find((g) => !g.collapsed);
      if (openGroup) {
        await chromeApi.tabs.group({ tabIds, groupId: openGroup.id });
      } else {
        const groupId = await chromeApi.tabs.group({ tabIds });
        await chromeApi.tabGroups.update(groupId, {
          title: repoName,
          color: colors[colorIndex % colors.length],
          collapsed: false,
        });
        colorIndex++;
      }
    }
  } else {
    const prTabIds = uniqueTabs
      .filter((t) => prUrls.has(t.url))
      .map((t) => t.id);
    if (prTabIds.length > 0) {
      const existingGroups = await chromeApi.tabGroups.query({
        title: "PRs",
        windowId: currentWindowId,
      });
      const openGroup = existingGroups.find((g) => !g.collapsed);

      if (openGroup) {
        await chromeApi.tabs.group({ tabIds: prTabIds, groupId: openGroup.id });
      } else {
        const groupId = await chromeApi.tabs.group({ tabIds: prTabIds });
        const title =
          existingGroups.length > 0
            ? `PRs ${new Date().toLocaleDateString()}`
            : "PRs";
        await chromeApi.tabGroups.update(groupId, {
          title,
          color: "purple",
          collapsed: false,
        });
      }
    }
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
