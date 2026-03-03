# Tabkey

Tabkey is a Manifest V3 browser extension for Chrome/Chromium that lets you assign number keys `1` through `9` to your currently open tabs, then jump to those tabs instantly.

## What it does

- Lists every open tab in a compact popup panel.
- Lets you assign or clear a number beside each tab.
- Uses each number as a toggle: press once to jump to the assigned tab, press it again to return to the tab you came from.
- Includes a search box so large tab sets stay manageable.
- Supports opening the panel from a keyboard shortcut (`Alt+Shift+K` by default).
- Includes a quick overview shortcut (`Alt+Shift+O` by default) that briefly overlays only the assigned tabs and their keys on the current page.
- Adapts automatically to system light and dark mode.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder:
   `/Users/aniket/Documents/Personal Project/Tabkey`
4. Optional: open `chrome://extensions/shortcuts` to change the panel and overview shortcuts.

## Use

1. Click the Tabkey toolbar icon, or use the popup shortcut.
2. Find a tab in the list.
3. Type a number from `1` to `9` in the shortcut box beside it.
4. Press that number on a normal web page to jump to the assigned tab.
5. Press the same number again while you are on that assigned tab to return to the tab you came from.
6. Clear a shortcut by deleting the number in its box.
7. Use `Alt+Shift+O` to flash a quick in-page overview of assigned tabs only.

## Notes

- Number key switching is ignored while your cursor is inside inputs, textareas, selects, or editable content.
- Chrome restricts content scripts on internal pages such as `chrome://` URLs and the Chrome Web Store, so bare number shortcuts will not trigger from those pages.
- The quick overview uses the same content-script limitation, so it will not appear on pages where extensions cannot inject UI.
