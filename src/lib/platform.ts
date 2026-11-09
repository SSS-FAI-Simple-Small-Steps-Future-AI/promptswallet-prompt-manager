/** "⌘" on macOS, "Ctrl" elsewhere, for shortcut hints shown in the UI. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = IS_MAC ? "⌘" : "Ctrl";
