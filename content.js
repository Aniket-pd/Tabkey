const STORAGE_KEY = "shortcutAssignments";
const VALID_SHORTCUTS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
const OVERVIEW_TIMEOUT_MS = 2200;
const OVERVIEW_HOST_ID = "tabkey-overview-host";

let assignments = {};
let overviewHideTimer = null;
let extensionContextInvalidated = false;

function isContextInvalidationError(error) {
  return String(error?.message || error || "")
    .toLowerCase()
    .includes("extension context invalidated");
}

function safeSendMessage(message) {
  if (extensionContextInvalidated) {
    return;
  }

  try {
    const maybePromise = chrome.runtime.sendMessage(message);

    if (maybePromise && typeof maybePromise.then === "function") {
      void maybePromise.catch((error) => {
        if (isContextInvalidationError(error)) {
          extensionContextInvalidated = true;
        }
      });
    }
  } catch (error) {
    if (isContextInvalidationError(error)) {
      extensionContextInvalidated = true;
      return;
    }

    throw error;
  }
}

function sanitizeAssignments(rawAssignments) {
  const cleanedAssignments = {};

  for (const [shortcut, tabId] of Object.entries(rawAssignments || {})) {
    if (!VALID_SHORTCUTS.has(shortcut) || !Number.isInteger(tabId)) {
      continue;
    }

    cleanedAssignments[shortcut] = tabId;
  }

  return cleanedAssignments;
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"]'));
}

function getOverviewHost() {
  let host = document.getElementById(OVERVIEW_HOST_ID);

  if (host) {
    return host;
  }

  host = document.createElement("div");
  host.id = OVERVIEW_HOST_ID;
  document.documentElement.appendChild(host);
  return host;
}

function clearOverview() {
  if (overviewHideTimer !== null) {
    window.clearTimeout(overviewHideTimer);
    overviewHideTimer = null;
  }

  const host = document.getElementById(OVERVIEW_HOST_ID);

  if (host) {
    host.remove();
  }
}

function getTabMeta(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace(/^www\./, "") || parsedUrl.protocol.replace(":", "");
  } catch (error) {
    return "Open tab";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createOverviewMarkup(items) {
  const rows = items.length
    ? items
      .map((item) => {
        const activeBadge = item.active
          ? '<span class="tabkey-badge">Current</span>'
          : "";

        return `
          <div class="tabkey-row">
            <span class="tabkey-key">${escapeHtml(item.shortcut)}</span>
            <div class="tabkey-copy">
              <div class="tabkey-title">${escapeHtml(item.title)}</div>
              <div class="tabkey-meta">
                <span>${escapeHtml(getTabMeta(item.url))}</span>
                ${activeBadge}
              </div>
            </div>
          </div>
        `;
      })
      .join("")
    : '<div class="tabkey-empty">No shortcuts assigned yet.</div>';

  return `
    <style>
      :host {
        all: initial;
      }

      .tabkey-wrap {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 32px));
        padding: 14px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.9);
        color: #e5e7eb;
        box-shadow: 0 18px 44px rgba(2, 8, 23, 0.35);
        backdrop-filter: blur(14px);
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        pointer-events: none;
      }

      .tabkey-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      .tabkey-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #7dd3fc;
      }

      .tabkey-hint {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
      }

      .tabkey-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .tabkey-row {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        padding: 10px;
        border-radius: 14px;
        background: rgba(30, 41, 59, 0.72);
      }

      .tabkey-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: rgba(248, 250, 252, 0.96);
        color: #0f766e;
        font-size: 20px;
        font-weight: 700;
      }

      .tabkey-copy {
        min-width: 0;
      }

      .tabkey-title {
        overflow: hidden;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tabkey-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        font-size: 11px;
        color: #94a3b8;
      }

      .tabkey-badge {
        padding: 3px 7px;
        border-radius: 999px;
        background: rgba(79, 209, 197, 0.18);
        color: #5eead4;
        font-weight: 700;
      }

      .tabkey-empty {
        padding: 10px;
        border-radius: 14px;
        background: rgba(30, 41, 59, 0.72);
        font-size: 12px;
        color: #cbd5e1;
      }
    </style>
    <div class="tabkey-wrap" role="status" aria-live="polite" aria-label="Tabkey shortcut overview">
      <div class="tabkey-head">
        <span class="tabkey-label">Shortcuts</span>
        <span class="tabkey-hint">Auto-hides</span>
      </div>
      <div class="tabkey-list">${rows}</div>
    </div>
  `;
}

function showOverview(items) {
  const existingHost = document.getElementById(OVERVIEW_HOST_ID);

  if (existingHost) {
    clearOverview();
    return;
  }

  const host = getOverviewHost();
  const shadowRoot = host.attachShadow({ mode: "open" });
  shadowRoot.innerHTML = createOverviewMarkup(items);

  overviewHideTimer = window.setTimeout(() => {
    clearOverview();
  }, OVERVIEW_TIMEOUT_MS);
}

async function hydrateAssignments() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  assignments = sanitizeAssignments(stored[STORAGE_KEY]);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) {
    return;
  }

  assignments = sanitizeAssignments(changes[STORAGE_KEY].newValue);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "showOverview" && Array.isArray(message.items)) {
    showOverview(message.items);
    sendResponse({ ok: true });
    return false;
  }

  sendResponse({ ok: false });
  return false;
});

window.addEventListener(
  "keydown",
  (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
      return;
    }

    if (!VALID_SHORTCUTS.has(event.key) || !assignments[event.key]) {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    safeSendMessage({ type: "activateShortcut", shortcut: event.key });
  },
  true
);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.getElementById(OVERVIEW_HOST_ID)) {
    clearOverview();
  }
});

void hydrateAssignments().catch(() => {
  assignments = {};
});
