import { consolidateTabs } from "./consolidate.js";

chrome.action.onClicked.addListener(async (activeTab) => {
  await consolidateTabs(chrome, activeTab.windowId);
});
