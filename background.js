const ASSIGNMENTS_KEY = "shortcutAssignments";
const TOGGLE_HISTORY_KEY = "toggleHistory";
const VALID_SHORTCUTS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);

function sanitizeAssignments(rawAssignments) {
  const cleanedAssignments = {};
  const seenTabs = new Set();

  for (const [shortcut, tabId] of Object.entries(rawAssignments || {})) {
    if (!VALID_SHORTCUTS.has(shortcut) || !Number.isInteger(tabId) || seenTabs.has(tabId)) {
      continue;
    }

    cleanedAssignments[shortcut] = tabId;
    seenTabs.add(tabId);
  }

  return cleanedAssignments;
}

async function loadAssignments() {
  const stored = await chrome.storage.local.get(ASSIGNMENTS_KEY);
  return sanitizeAssignments(stored[ASSIGNMENTS_KEY]);
}

async function saveAssignments(assignments) {
  const cleanedAssignments = sanitizeAssignments(assignments);
  await chrome.storage.local.set({ [ASSIGNMENTS_KEY]: cleanedAssignments });
  return cleanedAssignments;
}

function sanitizeToggleHistory(rawHistory, assignments) {
  const cleanedHistory = {};

  for (const [shortcut, tabId] of Object.entries(rawHistory || {})) {
    if (
      !VALID_SHORTCUTS.has(shortcut) ||
      !Number.isInteger(tabId) ||
      !Number.isInteger(assignments[shortcut]) ||
      tabId === assignments[shortcut]
    ) {
      continue;
    }

    cleanedHistory[shortcut] = tabId;
  }

  return cleanedHistory;
}

async function loadToggleHistory(assignments = null) {
  const nextAssignments = assignments || await loadAssignments();
  const stored = await chrome.storage.local.get(TOGGLE_HISTORY_KEY);
  return sanitizeToggleHistory(stored[TOGGLE_HISTORY_KEY], nextAssignments);
}

async function saveToggleHistory(toggleHistory, assignments = null) {
  const nextAssignments = assignments || await loadAssignments();
  const cleanedHistory = sanitizeToggleHistory(toggleHistory, nextAssignments);
  await chrome.storage.local.set({ [TOGGLE_HISTORY_KEY]: cleanedHistory });
  return cleanedHistory;
}

async function pruneRemovedTab(tabId) {
  const assignments = await loadAssignments();
  let assignmentsChanged = false;

  for (const [shortcut, assignedTabId] of Object.entries(assignments)) {
    if (assignedTabId !== tabId) {
      continue;
    }

    delete assignments[shortcut];
    assignmentsChanged = true;
  }

  const nextAssignments = assignmentsChanged ? await saveAssignments(assignments) : assignments;
  const toggleHistory = await loadToggleHistory(nextAssignments);
  let historyChanged = false;

  for (const [shortcut, previousTabId] of Object.entries(toggleHistory)) {
    if (previousTabId !== tabId && Number.isInteger(nextAssignments[shortcut])) {
      continue;
    }

    delete toggleHistory[shortcut];
    historyChanged = true;
  }

  if (historyChanged || assignmentsChanged) {
    await saveToggleHistory(toggleHistory, nextAssignments);
  }
}

async function buildState() {
  const [tabs, assignments] = await Promise.all([
    chrome.tabs.query({}),
    loadAssignments()
  ]);

  return {
    assignments,
    tabs: tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => ({
        active: Boolean(tab.active),
        favIconUrl: tab.favIconUrl || "",
        id: tab.id,
        index: tab.index,
        title: tab.title || tab.url || "Untitled tab",
        url: tab.url || "",
        windowId: tab.windowId
      }))
  };
}

async function assignShortcutToTab(tabId, shortcut) {
  const assignments = await loadAssignments();
  const previousAssignments = { ...assignments };

  for (const [assignedShortcut, assignedTabId] of Object.entries(assignments)) {
    if (assignedTabId === tabId || assignedShortcut === shortcut) {
      delete assignments[assignedShortcut];
    }
  }

  if (VALID_SHORTCUTS.has(shortcut)) {
    assignments[shortcut] = tabId;
  }

  const nextAssignments = await saveAssignments(assignments);
  const toggleHistory = await loadToggleHistory(previousAssignments);

  for (const trackedShortcut of VALID_SHORTCUTS) {
    if (previousAssignments[trackedShortcut] !== nextAssignments[trackedShortcut]) {
      delete toggleHistory[trackedShortcut];
    }
  }

  await saveToggleHistory(toggleHistory, nextAssignments);
  return nextAssignments;
}

async function focusTab(tabId) {
  const tab = await chrome.tabs.get(tabId);

  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });

  return { ok: true, tabId };
}

async function showOverviewInActiveTab() {
  const state = await buildState();
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (!activeTab || !Number.isInteger(activeTab.id)) {
    return;
  }

  const items = Object.entries(state.assignments)
    .map(([shortcut, tabId]) => {
      const tab = state.tabs.find((entry) => entry.id === tabId);

      if (!tab) {
        return null;
      }

      return {
        active: tab.active,
        shortcut,
        title: tab.title,
        url: tab.url
      };
    })
    .filter((item) => Boolean(item))
    .sort((left, right) => Number(left.shortcut) - Number(right.shortcut));

  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      items,
      type: "showOverview"
    });
  } catch (error) {
    // The current tab may not allow content scripts (for example chrome:// pages).
  }
}

async function resolveCurrentTab(sender, requestedCurrentTabId = null) {
  if (Number.isInteger(requestedCurrentTabId)) {
    try {
      return await chrome.tabs.get(requestedCurrentTabId);
    } catch (error) {
      // Fall through to other resolution strategies.
    }
  }

  if (Number.isInteger(sender?.tab?.id)) {
    return chrome.tabs.get(sender.tab.id);
  }

  try {
    const activeTabs = await chrome.tabs.query({ active: true });
    const activeTab = activeTabs
      .filter((tab) => Number.isInteger(tab.id))
      .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];

    if (activeTab && Number.isInteger(activeTab.id)) {
      return chrome.tabs.get(activeTab.id);
    }
  } catch (error) {
    // Fall through to tab query fallback.
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (!activeTab || !Number.isInteger(activeTab.id)) {
    throw new Error("No active tab found");
  }

  return activeTab;
}

async function activateShortcut(shortcut, sender, requestedCurrentTabId = null) {
  if (!VALID_SHORTCUTS.has(shortcut)) {
    return { ok: false };
  }

  const [assignments, currentTab] = await Promise.all([
    loadAssignments(),
    resolveCurrentTab(sender, requestedCurrentTabId)
  ]);
  const tabId = assignments[shortcut];

  if (!tabId) {
    return { ok: false };
  }

  const toggleHistory = await loadToggleHistory(assignments);
  let targetTabId = tabId;
  let targetIsAssignedTab = true;

  if (currentTab.id === tabId) {
    const previousTabId = toggleHistory[shortcut];

    if (!Number.isInteger(previousTabId)) {
      return { ok: false };
    }

    try {
      await chrome.tabs.get(previousTabId);
    } catch (error) {
      delete toggleHistory[shortcut];
      await saveToggleHistory(toggleHistory, assignments);
      return { ok: false };
    }

    targetTabId = previousTabId;
    targetIsAssignedTab = false;
  }

  try {
    if (targetIsAssignedTab) {
      await chrome.tabs.get(targetTabId);
    }

    toggleHistory[shortcut] = currentTab.id;
    await saveToggleHistory(toggleHistory, assignments);
    return await focusTab(targetTabId);
  } catch (error) {
    if (!targetIsAssignedTab) {
      delete toggleHistory[shortcut];
      await saveToggleHistory(toggleHistory, assignments);
      return { ok: false };
    }

    delete assignments[shortcut];
    await saveAssignments(assignments);
    delete toggleHistory[shortcut];
    await saveToggleHistory(toggleHistory, assignments);
    return { ok: false };
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void pruneRemovedTab(tabId);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") {
    return;
  }

  void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open_overview") {
    void showOverviewInActiveTab();
    return;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    sendResponse({ ok: false });
    return false;
  }

  if (message.type === "getState") {
    void buildState()
      .then((state) => sendResponse(state))
      .catch(() => sendResponse({ assignments: {}, tabs: [] }));
    return true;
  }

  if (message.type === "assignShortcut") {
    const { shortcut, tabId } = message;

    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false });
      return false;
    }

    void assignShortcutToTab(tabId, typeof shortcut === "string" ? shortcut : "")
      .then((assignments) => sendResponse({ ok: true, assignments }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "activateShortcut") {
    void activateShortcut(
      message.shortcut,
      sender,
      Number.isInteger(message.currentTabId) ? message.currentTabId : null
    )
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "activateTab") {
    const { tabId } = message;

    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false });
      return false;
    }

    void focusTab(tabId)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  sendResponse({ ok: false });
  return false;
});
