import { consolidateTabs } from "./consolidate.js";
import { deduplicateTabs } from "./deduplicate.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "groupByPrs",
    title: "Group by PRs",
    type: "radio",
    checked: true,
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "groupByRepo",
    title: "Group by repo name",
    type: "radio",
    checked: false,
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "separator",
    type: "separator",
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "deduplicateNow",
    title: "Deduplicate now",
    contexts: ["action"],
  });

  chrome.storage.local.get("groupBy", ({ groupBy }) => {
    if (groupBy === "repo") {
      chrome.contextMenus.update("groupByRepo", { checked: true });
      chrome.contextMenus.update("groupByPrs", { checked: false });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "groupByPrs") {
    chrome.storage.local.set({ groupBy: "prs" });
  } else if (info.menuItemId === "groupByRepo") {
    chrome.storage.local.set({ groupBy: "repo" });
  } else if (info.menuItemId === "deduplicateNow") {
    await deduplicateTabs(
      chrome,
      tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT,
    );
  }
});

chrome.action.onClicked.addListener(async (activeTab) => {
  const { groupBy = "prs" } = await chrome.storage.local.get("groupBy");
  await consolidateTabs(chrome, activeTab.windowId, { groupBy });
  await deduplicateTabs(chrome, activeTab.windowId);
});
