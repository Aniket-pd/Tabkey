const openPanelButton = document.getElementById("openPanel");
const launchShortcut = document.getElementById("launchShortcut");

async function updateLaunchShortcutHint() {
  if (!(launchShortcut instanceof HTMLElement)) {
    return;
  }

  try {
    const platform = await chrome.runtime.getPlatformInfo();
    const isMac = String(platform.os).toLowerCase().includes("mac");
    launchShortcut.textContent = isMac ? "Option+Shift+K" : "Alt+Shift+K";
  } catch (error) {
    // Keep default label if platform check fails.
  }
}

if (openPanelButton instanceof HTMLButtonElement) {
  openPanelButton.addEventListener("click", () => {
    void chrome.action.openPopup().catch(() => {
      void chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
    });
  });
}

void updateLaunchShortcutHint();
