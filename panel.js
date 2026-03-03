const VALID_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  "Delete",
  "End",
  "Enter",
  "Home",
  "Tab"
]);

const state = {
  assignments: {},
  query: "",
  tabs: []
};

const elements = {
  panelShortcutModifier: document.getElementById("panelShortcutModifier"),
  searchInput: document.getElementById("searchInput"),
  summary: document.getElementById("summary"),
  tabList: document.getElementById("tabList")
};

function buildAssignedByTab() {
  return new Map(
    Object.entries(state.assignments).map(([shortcut, tabId]) => [tabId, shortcut])
  );
}

function sanitizeShortcut(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "");
  const nextShortcut = digitsOnly.charAt(0);
  return VALID_SHORTCUTS.includes(nextShortcut) ? nextShortcut : "";
}

function matchesQuery(tab) {
  if (!state.query) {
    return true;
  }

  const haystack = `${tab.title} ${tab.url}`.toLowerCase();
  return haystack.includes(state.query);
}

function sortTabs(tabs, assignedByTab) {
  return [...tabs].sort((left, right) => {
    const leftAssigned = assignedByTab.has(left.id);
    const rightAssigned = assignedByTab.has(right.id);

    if (leftAssigned !== rightAssigned) {
      return leftAssigned ? -1 : 1;
    }

    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.windowId !== right.windowId) {
      return left.windowId - right.windowId;
    }

    return left.index - right.index;
  });
}

function getTabMeta(tab) {
  try {
    const parsedUrl = new URL(tab.url);
    return parsedUrl.hostname.replace(/^www\./, "") || parsedUrl.protocol.replace(":", "");
  } catch (error) {
    return "Open tab";
  }
}

function updateSummary(visibleCount) {
  const assignmentCount = Object.keys(state.assignments).length;
  const tabLabel = visibleCount === 1 ? "tab" : "tabs";
  const assignmentLabel = assignmentCount === 1 ? "shortcut" : "shortcuts";

  elements.summary.textContent =
    `Showing ${visibleCount} of ${state.tabs.length} ${tabLabel}. ` +
    `${assignmentCount} ${assignmentLabel} assigned.`;
}

function renderEmptyState(message) {
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.textContent = message;
  elements.tabList.replaceChildren(emptyState);
}

function render(focusTabId = null) {
  const assignedByTab = buildAssignedByTab();
  const visibleTabs = sortTabs(state.tabs.filter(matchesQuery), assignedByTab);

  updateSummary(visibleTabs.length);

  if (!visibleTabs.length) {
    renderEmptyState(state.tabs.length ? "No tabs match that search." : "No open tabs were found.");
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const tab of visibleTabs) {
    const card = document.createElement("article");
    card.className = `tab-card${tab.active ? " is-active" : ""}`;

    const tabButton = document.createElement("button");
    tabButton.className = "tab-button";
    tabButton.type = "button";
    tabButton.title = "Focus this tab";
    tabButton.addEventListener("click", () => {
      void activateTab(tab.id);
    });

    if (tab.favIconUrl) {
      const favicon = document.createElement("img");
      favicon.className = "favicon";
      favicon.alt = "";
      favicon.src = tab.favIconUrl;
      favicon.addEventListener("error", () => {
        favicon.replaceWith(buildFaviconPlaceholder());
      });
      tabButton.appendChild(favicon);
    } else {
      tabButton.appendChild(buildFaviconPlaceholder());
    }

    const copy = document.createElement("div");
    copy.className = "tab-copy";

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title;
    copy.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "tab-meta";
    meta.textContent = getTabMeta(tab);

    if (tab.active) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Current";
      meta.appendChild(badge);
    }

    copy.appendChild(meta);
    tabButton.appendChild(copy);

    const shortcutGroup = document.createElement("label");
    shortcutGroup.className = "shortcut-group";

    const shortcutLabel = document.createElement("span");
    shortcutLabel.className = "shortcut-label";
    shortcutLabel.textContent = "Shortcut";

    const shortcutInput = document.createElement("input");
    shortcutInput.className = "shortcut-input";
    shortcutInput.type = "text";
    shortcutInput.inputMode = "numeric";
    shortcutInput.maxLength = 1;
    shortcutInput.placeholder = " ";
    shortcutInput.value = assignedByTab.get(tab.id) || "";
    shortcutInput.setAttribute("aria-label", `Shortcut for ${tab.title}`);
    shortcutInput.dataset.tabId = String(tab.id);

    shortcutInput.addEventListener("focus", () => {
      shortcutInput.select();
    });

    shortcutInput.addEventListener("input", (event) => {
      const nextShortcut = sanitizeShortcut(event.target.value);
      shortcutInput.value = nextShortcut;
      void assignShortcut(tab.id, nextShortcut);
    });

    shortcutInput.addEventListener("keydown", (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (
          event.key.length === 1 &&
          !VALID_SHORTCUTS.includes(event.key) &&
          !NAVIGATION_KEYS.has(event.key)
        ) {
          event.preventDefault();
          return;
        }
      }

      if (event.key === "Escape") {
        shortcutInput.value = assignedByTab.get(tab.id) || "";
        shortcutInput.select();
        event.preventDefault();
      }
    });

    shortcutGroup.append(shortcutLabel, shortcutInput);
    card.append(tabButton, shortcutGroup);
    fragment.appendChild(card);
  }

  elements.tabList.replaceChildren(fragment);

  if (focusTabId !== null) {
    const inputToFocus = elements.tabList.querySelector(`[data-tab-id="${focusTabId}"]`);

    if (inputToFocus instanceof HTMLInputElement) {
      inputToFocus.focus();
      inputToFocus.select();
    }
  }
}

function buildFaviconPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "favicon-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  return placeholder;
}

async function updateShortcutHint() {
  if (!(elements.panelShortcutModifier instanceof HTMLElement)) {
    return;
  }

  let platform = "";

  try {
    const info = await chrome.runtime.getPlatformInfo();
    platform = info.os;
  } catch (error) {
    platform = navigator.platform || "";
  }

  const isMac = String(platform).toLowerCase().includes("mac");
  elements.panelShortcutModifier.textContent = isMac ? "Option" : "Alt";
}

async function refreshState() {
  const nextState = await chrome.runtime.sendMessage({ type: "getState" });

  state.tabs = Array.isArray(nextState?.tabs) ? nextState.tabs : [];
  state.assignments = typeof nextState?.assignments === "object" && nextState.assignments
    ? nextState.assignments
    : {};

  render();
}

async function assignShortcut(tabId, shortcut) {
  const response = await chrome.runtime.sendMessage({
    shortcut,
    tabId,
    type: "assignShortcut"
  });

  if (!response?.ok) {
    return;
  }

  state.assignments = response.assignments;
  render(tabId);
}

async function activateTab(tabId) {
  const response = await chrome.runtime.sendMessage({ tabId, type: "activateTab" });

  if (response?.ok) {
    window.close();
  }
}

function attachEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.searchInput.value) {
      elements.searchInput.value = "";
      state.query = "";
      render();
      event.preventDefault();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  attachEvents();
  void Promise.all([
    refreshState(),
    updateShortcutHint()
  ]).then(() => {
    elements.searchInput.focus();
  });
});
