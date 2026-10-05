import { describe, it, expect, vi } from "vitest";
import { consolidateTabs } from "./consolidate.js";

function tab(url, windowId = 1) {
  return { url, windowId };
}

function mockChrome(inputTabs) {
  // Chrome returns snapshots, not references to its internal tab state.
  let tabs = inputTabs.map((tab, index) => ({ ...tab, id: index + 1 }));
  let nextGroupId = 100;
  return {
    tabs: {
      query: vi.fn(async ({ url, windowId }) =>
        tabs
          .filter(
            (tab) =>
              (windowId === undefined || tab.windowId === windowId) &&
              (url === undefined || tab.url.startsWith("https://github.com/")),
          )
          .map((tab) => ({ ...tab })),
      ),
      remove: vi.fn(async (ids) => {
        const removed = new Set(ids);
        tabs = tabs.filter((tab) => !removed.has(tab.id));
      }),
      update: vi.fn(async (id, changes) => {
        const tab = tabs.find((tab) => tab.id === id);
        Object.assign(tab, changes);
        return { ...tab };
      }),
      move: vi.fn(async (ids, { windowId }) => {
        for (const id of ids) {
          tabs.find((tab) => tab.id === id).windowId = windowId;
        }
      }),
      group: vi.fn(async () => nextGroupId++),
    },
    tabGroups: {
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
    },
    windows: {
      remove: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("exact URL deduplication", () => {
  it.each([
    {
      name: "removes duplicates",
      paths: ["issues/1", "issues/1"],
      removed: [2],
    },
    {
      name: "keeps distinct URLs",
      paths: ["issues/1", "issues/2"],
      removed: [],
    },
    {
      name: "keeps the first of several duplicates",
      paths: ["issues/1", "issues/1", "issues/1"],
      removed: [2, 3],
    },
  ])("$name", async ({ paths, removed }) => {
    const chrome = mockChrome(
      paths.map((path) => tab(`https://github.com/org/repo/${path}`)),
    );
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove.mock.calls).toEqual(
      removed.length ? [[removed]] : [],
    );
    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.move).toHaveBeenCalledExactlyOnceWith(
      paths.map((_, index) => index + 1).filter((id) => !removed.includes(id)),
      { windowId: 1, index: -1 },
    );
  });
});

describe("PR tab deduplication", () => {
  it.each([
    {
      name: "closes sub-paths when the base exists",
      suffixes: ["", "/files", "/commits"],
      keep: 1,
      removed: [2, 3],
      navigate: false,
    },
    {
      name: "prefers a base tab encountered later",
      suffixes: ["/files", "", "/commits"],
      keep: 2,
      removed: [1, 3],
      navigate: false,
    },
    {
      name: "navigates the first sub-path when no base exists",
      suffixes: ["/files", "/commits"],
      keep: 1,
      removed: [2],
      navigate: true,
    },
    {
      name: "navigates a single sub-path",
      suffixes: ["/files"],
      keep: 1,
      removed: [],
      navigate: true,
    },
    {
      name: "leaves a single base untouched",
      suffixes: [""],
      keep: 1,
      removed: [],
      navigate: false,
    },
    {
      name: "closes fragments when the base exists",
      suffixes: ["", "#pullrequestreview-123"],
      keep: 1,
      removed: [2],
      navigate: false,
    },
    {
      name: "navigates a fragment-only tab",
      suffixes: ["#pullrequestreview-123"],
      keep: 1,
      removed: [],
      navigate: true,
    },
    {
      name: "closes mixed fragments and sub-paths",
      suffixes: ["", "#pullrequestreview-123", "/files"],
      keep: 1,
      removed: [2, 3],
      navigate: false,
    },
    {
      name: "closes deep sub-paths",
      suffixes: ["", "/files/abc123"],
      keep: 1,
      removed: [2],
      navigate: false,
    },
    {
      name: "combines exact and PR deduplication",
      suffixes: ["", "/files", "/files"],
      keep: 1,
      removed: [3, 2],
      navigate: false,
    },
  ])("$name", async ({ suffixes, keep, removed, navigate }) => {
    const baseUrl = "https://github.com/org/repo/pull/42";
    const chrome = mockChrome(suffixes.map((suffix) => tab(baseUrl + suffix)));
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove.mock.calls).toEqual(
      removed.length ? [[removed]] : [],
    );
    expect(chrome.tabs.update.mock.calls).toEqual(
      navigate ? [[keep, { url: baseUrl }]] : [],
    );
    expect(chrome.tabs.move).toHaveBeenCalledExactlyOnceWith([keep], {
      windowId: 1,
      index: -1,
    });
    expect(chrome.tabs.group).toHaveBeenCalledExactlyOnceWith({
      tabIds: [keep],
    });
  });

  it("handles multiple PRs from the same repo independently", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo/pull/1"),
      tab("https://github.com/org/repo/pull/1/files"),
      tab("https://github.com/org/repo/pull/2/commits"),
      tab("https://github.com/org/repo/pull/2/checks"),
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.remove).toHaveBeenCalledExactlyOnceWith([2, 4]);
    expect(chrome.tabs.update).toHaveBeenCalledExactlyOnceWith(3, {
      url: "https://github.com/org/repo/pull/2",
    });
    expect(chrome.tabs.group).toHaveBeenCalledExactlyOnceWith({
      tabIds: [1, 3],
    });
  });

  it("handles PRs from different repos independently", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo-a/pull/1/files"),
      tab("https://github.com/org/repo-b/pull/1/files"),
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.update.mock.calls).toEqual([
      [1, { url: "https://github.com/org/repo-a/pull/1" }],
      [2, { url: "https://github.com/org/repo-b/pull/1" }],
    ]);
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(chrome.tabs.group).toHaveBeenCalledExactlyOnceWith({
      tabIds: [1, 2],
    });
  });
});

describe("tab sorting", () => {
  it("moves tabs sorted by URL to the current window", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo/pull/9", 2),
      tab("https://github.com/org/repo/issues/1", 3),
    ]);
    await consolidateTabs(chrome, 7);

    expect(chrome.tabs.move).toHaveBeenCalledExactlyOnceWith([2, 1], {
      windowId: 7,
      index: -1,
    });
  });

  it("sorts navigated PRs using their base URLs", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo/pull/1/files"),
      tab("https://github.com/org/repo/pull/1-references"),
    ]);
    await consolidateTabs(chrome, 1);

    const sortedIds = [
      { id: 1, url: "https://github.com/org/repo/pull/1" },
      { id: 2, url: "https://github.com/org/repo/pull/1-references" },
    ]
      .sort((a, b) => a.url.localeCompare(b.url))
      .map((tab) => tab.id);
    expect(chrome.tabs.move).toHaveBeenCalledExactlyOnceWith(sortedIds, {
      windowId: 1,
      index: -1,
    });
  });
});

describe("window cleanup", () => {
  it("closes each empty source window once and leaves the current window open", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo", 2),
      tab("https://github.com/org/repo/issues/1", 2),
      tab("https://github.com/org/repo/issues/2", 3),
      tab("https://github.com/org/repo/issues/3", 1),
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.windows.remove.mock.calls).toEqual([[2], [3]]);
    expect(chrome.tabs.query.mock.calls).toEqual([
      [{ url: "https://github.com/*" }],
      [{ windowId: 2 }],
      [{ windowId: 3 }],
    ]);
  });

  it("keeps windows containing non-GitHub tabs", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo", 2),
      tab("https://example.com/", 2),
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.move).toHaveBeenCalledExactlyOnceWith([1], {
      windowId: 1,
      index: -1,
    });
    expect(chrome.windows.remove).not.toHaveBeenCalled();
  });

  it.each(["query", "remove"])(
    "continues cleanup when a window %s fails",
    async (method) => {
      const chrome = mockChrome([
        tab("https://github.com/org/repo", 2),
        tab("https://github.com/org/repo/issues/1", 3),
      ]);
      if (method === "query") {
        chrome.tabs.query
          .mockResolvedValueOnce([
            { id: 1, url: "https://github.com/org/repo", windowId: 2 },
            { id: 2, url: "https://github.com/org/repo/issues/1", windowId: 3 },
          ])
          .mockRejectedValueOnce(new Error("Window already closed"));
      } else {
        chrome.windows.remove.mockRejectedValueOnce(
          new Error("Window already closed"),
        );
      }

      await expect(consolidateTabs(chrome, 1)).resolves.toBeUndefined();
      expect(chrome.windows.remove).toHaveBeenCalledWith(3);
    },
  );
});

describe("PR tab grouping", () => {
  it.each([
    {
      name: "creates a new PRs group",
      groups: [],
      groupId: undefined,
      title: "PRs",
    },
    {
      name: "reuses an open PRs group",
      groups: [{ id: 50, collapsed: false }],
      groupId: 50,
    },
    {
      name: "creates a dated group beside a collapsed group",
      groups: [{ id: 50, collapsed: true }],
      groupId: undefined,
      title: "dated",
    },
    {
      name: "prefers an open group over a collapsed group",
      groups: [
        { id: 50, collapsed: true },
        { id: 60, collapsed: false },
      ],
      groupId: 60,
    },
  ])("$name", async ({ groups, groupId, title }) => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo/pull/1"),
      tab("https://github.com/org/repo/pull/2"),
    ]);
    chrome.tabGroups.query.mockResolvedValue(groups);
    const date = new Date(2026, 5, 23, 12);
    vi.setSystemTime(date);
    try {
      await consolidateTabs(chrome, 1);

      expect(chrome.tabGroups.query).toHaveBeenCalledExactlyOnceWith({
        title: "PRs",
        windowId: 1,
      });
      expect(chrome.tabs.group).toHaveBeenCalledExactlyOnceWith(
        groupId === undefined
          ? { tabIds: [1, 2] }
          : { tabIds: [1, 2], groupId },
      );
      expect(chrome.tabGroups.update.mock.calls).toEqual(
        groupId === undefined
          ? [
              [
                100,
                {
                  title:
                    title === "dated"
                      ? `PRs ${date.toLocaleDateString()}`
                      : title,
                  color: "purple",
                  collapsed: false,
                },
              ],
            ]
          : [],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not create a group when there are no PR tabs", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo/issues/1"),
      tab("https://github.com/org/repo/issues/2"),
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabGroups.query).not.toHaveBeenCalled();
    expect(chrome.tabs.group).not.toHaveBeenCalled();
    expect(chrome.tabGroups.update).not.toHaveBeenCalled();
  });

  it("groups only PR tabs in URL order", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo/issues/5"),
      tab("https://github.com/org/repo/pull/20"),
      tab("https://github.com/org/repo/pull/10"),
    ]);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.group).toHaveBeenCalledExactlyOnceWith({
      tabIds: [3, 2],
    });
  });
});

describe("repo name grouping", () => {
  it("groups by repo name regardless of org and assigns colors in repo order", async () => {
    const chrome = mockChrome([
      tab("https://github.com/orgA/other-repo/issues/3"),
      tab("https://github.com/orgA/my-repo/issues/1"),
      tab("https://github.com/orgB/my-repo/pull/2"),
    ]);
    await consolidateTabs(chrome, 1, { groupBy: "repo" });

    expect(chrome.tabs.group.mock.calls).toEqual([
      [{ tabIds: [2, 3] }],
      [{ tabIds: [1] }],
    ]);
    expect(chrome.tabGroups.update.mock.calls).toEqual([
      [100, { title: "my-repo", color: "blue", collapsed: false }],
      [101, { title: "other-repo", color: "red", collapsed: false }],
    ]);
  });

  it("reuses an existing open group for a repo name", async () => {
    const chrome = mockChrome([tab("https://github.com/org/my-repo/issues/1")]);
    chrome.tabGroups.query.mockResolvedValue([
      { id: 60, title: "my-repo", collapsed: false },
    ]);
    await consolidateTabs(chrome, 1, { groupBy: "repo" });

    expect(chrome.tabGroups.query).toHaveBeenCalledExactlyOnceWith({
      title: "my-repo",
      windowId: 1,
    });
    expect(chrome.tabs.group).toHaveBeenCalledExactlyOnceWith({
      tabIds: [1],
      groupId: 60,
    });
    expect(chrome.tabGroups.update).not.toHaveBeenCalled();
  });

  it("groups PRs and issues together when groupBy is repo", async () => {
    const chrome = mockChrome([
      tab("https://github.com/org/repo/pull/1"),
      tab("https://github.com/org/repo/issues/2"),
    ]);
    await consolidateTabs(chrome, 1, { groupBy: "repo" });

    expect(chrome.tabs.group).toHaveBeenCalledExactlyOnceWith({
      tabIds: [2, 1],
    });
    expect(chrome.tabGroups.query).toHaveBeenCalledExactlyOnceWith({
      title: "repo",
      windowId: 1,
    });
  });
});

describe("no-op cases", () => {
  it.each([
    { name: "no tabs", tabs: [] },
    { name: "only non-GitHub tabs", tabs: [tab("https://example.com/", 2)] },
  ])("does nothing with $name", async ({ tabs }) => {
    const chrome = mockChrome(tabs);
    await consolidateTabs(chrome, 1);

    expect(chrome.tabs.query).toHaveBeenCalledExactlyOnceWith({
      url: "https://github.com/*",
    });
    for (const api of [chrome.tabs, chrome.tabGroups, chrome.windows]) {
      for (const method of Object.values(api)) {
        if (method !== chrome.tabs.query) expect(method).not.toHaveBeenCalled();
      }
    }
  });
});
