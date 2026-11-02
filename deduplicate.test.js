import { describe, it, expect, vi } from "vitest";
import { deduplicateTabs } from "./deduplicate.js";

function mockChrome(inputTabs) {
  const tabs = inputTabs.map((tab, i) => ({
    windowId: 1,
    index: i,
    id: i + 1,
    ...tab,
  }));
  return {
    tabs: {
      query: vi.fn(async ({ windowId }) =>
        tabs.filter((tab) => tab.windowId === windowId).map((tab) => ({ ...tab })),
      ),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("deduplicateTabs", () => {
  it("closes the right-most duplicate and keeps the left-most", async () => {
    const chrome = mockChrome([
      { url: "https://example.com/" },
      { url: "https://example.org/" },
      { url: "https://example.com/" },
    ]);
    const removed = await deduplicateTabs(chrome, 1);

    expect(chrome.tabs.query).toHaveBeenCalledExactlyOnceWith({ windowId: 1 });
    expect(chrome.tabs.remove).toHaveBeenCalledExactlyOnceWith([3]);
    expect(removed).toEqual([3]);
  });

  it("uses tab index rather than query order", async () => {
    const chrome = mockChrome([
      { url: "https://example.com/", index: 5 },
      { url: "https://example.com/", index: 0 },
    ]);
    await deduplicateTabs(chrome, 1);

    expect(chrome.tabs.remove).toHaveBeenCalledExactlyOnceWith([1]);
  });

  it("closes every copy except the left-most", async () => {
    const chrome = mockChrome([
      { url: "https://example.com/" },
      { url: "https://example.com/" },
      { url: "https://example.com/" },
    ]);
    await deduplicateTabs(chrome, 1);

    expect(chrome.tabs.remove).toHaveBeenCalledExactlyOnceWith([2, 3]);
  });

  it("does not touch GitHub tabs", async () => {
    const chrome = mockChrome([
      { url: "https://github.com/org/repo" },
      { url: "https://github.com/org/repo" },
    ]);
    await deduplicateTabs(chrome, 1);

    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("only considers tabs in the given window", async () => {
    const chrome = mockChrome([
      { url: "https://example.com/", windowId: 1 },
      { url: "https://example.com/", windowId: 2 },
    ]);
    await deduplicateTabs(chrome, 1);

    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("treats URLs that differ only by fragment or query as distinct", async () => {
    const chrome = mockChrome([
      { url: "https://example.com/" },
      { url: "https://example.com/#a" },
      { url: "https://example.com/?q=1" },
    ]);
    await deduplicateTabs(chrome, 1);

    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("falls back to pendingUrl and skips tabs without a URL", async () => {
    const chrome = mockChrome([
      { url: "", pendingUrl: "https://example.com/" },
      { url: "https://example.com/" },
      { url: "" },
      { url: "" },
    ]);
    await deduplicateTabs(chrome, 1);

    expect(chrome.tabs.remove).toHaveBeenCalledExactlyOnceWith([2]);
  });
});
