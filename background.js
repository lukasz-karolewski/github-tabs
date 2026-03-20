import { consolidateTabs } from "./consolidate.js";

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

  chrome.storage.local.get("groupBy", ({ groupBy }) => {
    if (groupBy === "repo") {
      chrome.contextMenus.update("groupByRepo", { checked: true });
      chrome.contextMenus.update("groupByPrs", { checked: false });
    }
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "groupByPrs") {
    chrome.storage.local.set({ groupBy: "prs" });
  } else if (info.menuItemId === "groupByRepo") {
    chrome.storage.local.set({ groupBy: "repo" });
  }
});

chrome.action.onClicked.addListener(async (activeTab) => {
  const { groupBy = "prs" } = await chrome.storage.local.get("groupBy");
  await consolidateTabs(chrome, activeTab.windowId, { groupBy });
});
