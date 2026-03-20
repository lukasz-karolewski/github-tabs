import { describe, it, expect, vi, beforeEach } from "vitest";
import { consolidateTabs } from "./consolidate.js";

let nextId = 1;
function tab(url, windowId = 1) {
  return { id: nextId++, url, windowId };
}

function mockChrome(tabs) {
  return {
    tabs: {
      query: vi.fn(async ({ url, windowId }) => {
        if (windowId !== undefined) {
          return tabs.filter((t) => t.windowId === windowId);
        }
        return [...tabs];
      }),
      remove: vi.fn(async (ids) => {
        for (const id of ids) {
          const idx = tabs.findIndex((t) => t.id === id);
          if (idx !== -1) tabs.splice(idx, 1);
        }
      }),
      update: vi.fn(async () => {}),
      move: vi.fn(async () => {}),
      group: vi.fn(async () => 100),
    },
    tabGroups: {
      query: vi.fn(async () => []),
      update: vi.fn(async () => {}),
    },
    windows: {
      remove: vi.fn(async () => {}),
    },
  };
}

beforeEach(() => {
  nextId = 1;
});

describe("exact URL deduplication", () => {
  it("removes duplicate tabs with the same URL", async () => {
    const tabs = [
      tab("https://github.com/org/repo/issues/1"),
      tab("https://github.com/org/repo/issues/1"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove).toHaveBeenCalledWith([2]);
  });

  it("keeps all tabs when no duplicates exist", async () => {
    const tabs = [
      tab("https://github.com/org/repo/issues/1"),
      tab("https://github.com/org/repo/issues/2"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
});

describe("PR tab deduplication", () => {
  it("closes sub-path tabs when base PR tab exists", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/1667"),
      tab("https://github.com/org/repo/pull/1667/files"),
      tab("https://github.com/org/repo/pull/1667/commits"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove).toHaveBeenCalledWith(
      expect.arrayContaining([2, 3])
    );
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  it("navigates first sub-path tab to base URL when no base tab exists", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/1667/files"),
      tab("https://github.com/org/repo/pull/1667/commits"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: "https://github.com/org/repo/pull/1667",
    });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(
      expect.arrayContaining([2])
    );
  });

  it("navigates single sub-path tab to base URL", async () => {
    const tabs = [tab("https://github.com/org/repo/pull/42/files")];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: "https://github.com/org/repo/pull/42",
    });
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("leaves a single base PR tab untouched", async () => {
    const tabs = [tab("https://github.com/org/repo/pull/99")];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("handles multiple PRs from the same repo independently", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/1"),
      tab("https://github.com/org/repo/pull/1/files"),
      tab("https://github.com/org/repo/pull/2/commits"),
      tab("https://github.com/org/repo/pull/2/checks"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    // PR 1: base exists, close /files
    expect(chrome.tabs.remove).toHaveBeenCalledWith(
      expect.arrayContaining([2])
    );
    // PR 2: no base, navigate first sub-path, close second
    expect(chrome.tabs.update).toHaveBeenCalledWith(3, {
      url: "https://github.com/org/repo/pull/2",
    });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(
      expect.arrayContaining([4])
    );
  });

  it("handles PRs from different repos independently", async () => {
    const tabs = [
      tab("https://github.com/org/repo-a/pull/1/files"),
      tab("https://github.com/org/repo-b/pull/1/files"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.update).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      url: "https://github.com/org/repo-a/pull/1",
    });
    expect(chrome.tabs.update).toHaveBeenCalledWith(2, {
      url: "https://github.com/org/repo-b/pull/1",
    });
  });

  it("does not treat non-PR paths as PRs", async () => {
    const tabs = [
      tab("https://github.com/org/repo/issues/1667"),
      tab("https://github.com/org/repo/issues/1667"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    // Only exact dedup, no PR logic
    expect(chrome.tabs.remove).toHaveBeenCalledWith([2]);
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  it("handles deep sub-paths like /files/sha", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/5"),
      tab("https://github.com/org/repo/pull/5/files/abc123"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove).toHaveBeenCalledWith(
      expect.arrayContaining([2])
    );
  });
});

describe("tab sorting", () => {
  it("moves tabs sorted by URL to the current window", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/9"),
      tab("https://github.com/org/repo/issues/1"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    // issues/1 sorts before pull/9
    expect(chrome.tabs.move).toHaveBeenCalledWith([2, 1], {
      windowId: 1,
      index: -1,
    });
  });
});

describe("window cleanup", () => {
  it("closes empty windows after moving tabs", async () => {
    const allTabs = [tab("https://github.com/org/repo", 2)];
    const chrome = mockChrome(allTabs);
    // After move, window 2 query returns empty
    chrome.tabs.query.mockImplementation(async ({ url, windowId }) => {
      if (windowId === 2) return [];
      return allTabs;
    });
    await consolidateTabs(chrome, 1);

    expect(chrome.windows.remove).toHaveBeenCalledWith(2);
  });

  it("does not close windows that still have tabs", async () => {
    const allTabs = [
      tab("https://github.com/org/repo", 2),
    ];
    const chrome = mockChrome(allTabs);
    chrome.tabs.query.mockImplementation(async ({ url, windowId }) => {
      if (windowId === 2) return [{ id: 99 }]; // non-github tab remains
      return allTabs;
    });
    await consolidateTabs(chrome, 1);

    expect(chrome.windows.remove).not.toHaveBeenCalled();
  });
});

describe("PR tab grouping", () => {
  it("creates a new 'PRs' group when no existing group", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/1"),
      tab("https://github.com/org/repo/pull/2"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabGroups.query).toHaveBeenCalledWith({
      title: "PRs",
      windowId: 1,
    });
    expect(chrome.tabs.group).toHaveBeenCalledWith({
      tabIds: [1, 2],
    });
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(100, {
      title: "PRs",
      color: "purple",
      collapsed: false,
    });
  });

  it("reuses an existing open 'PRs' group", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/1"),
      tab("https://github.com/org/repo/pull/2"),
    ];
    const chrome = mockChrome(tabs);
    chrome.tabGroups.query.mockResolvedValue([
      { id: 50, title: "PRs", collapsed: false },
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.group).toHaveBeenCalledWith({
      tabIds: [1, 2],
      groupId: 50,
    });
    expect(chrome.tabGroups.update).not.toHaveBeenCalled();
  });

  it("creates a dated group when a collapsed 'PRs' group exists", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/1"),
    ];
    const chrome = mockChrome(tabs);
    chrome.tabGroups.query.mockResolvedValue([
      { id: 50, title: "PRs", collapsed: true },
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.group).toHaveBeenCalledWith({
      tabIds: [1],
    });
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(100, {
      title: `PRs ${new Date().toLocaleDateString()}`,
      color: "purple",
      collapsed: false,
    });
  });

  it("does not create a group when there are no PR tabs", async () => {
    const tabs = [
      tab("https://github.com/org/repo/issues/1"),
      tab("https://github.com/org/repo/issues/2"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.group).not.toHaveBeenCalled();
    expect(chrome.tabGroups.update).not.toHaveBeenCalled();
  });

  it("groups the surviving tab after PR dedup", async () => {
    const tabs = [
      tab("https://github.com/org/repo/pull/1"),
      tab("https://github.com/org/repo/pull/1/files"),
      tab("https://github.com/org/repo/pull/1/commits"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    // Only the base tab survives
    expect(chrome.tabs.group).toHaveBeenCalledWith({
      tabIds: [1],
    });
  });

  it("groups mixed PR and non-PR tabs correctly", async () => {
    const tabs = [
      tab("https://github.com/org/repo/issues/5"),
      tab("https://github.com/org/repo/pull/10"),
      tab("https://github.com/org/repo/pull/20"),
    ];
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    // Only PR tabs are grouped, sorted by URL (pull/10 before pull/20)
    expect(chrome.tabs.group).toHaveBeenCalledWith({
      tabIds: [2, 3],
    });
  });
});

describe("no-op cases", () => {
  it("does nothing when there are no GitHub tabs", async () => {
    const chrome = mockChrome([]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(chrome.tabs.move).not.toHaveBeenCalled();
  });
});
