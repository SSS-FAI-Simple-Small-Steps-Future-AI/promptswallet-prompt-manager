import { useCallback, useEffect, useRef, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try {
      const saved = localStorage.getItem("pv-theme");
      if (saved === "light" || saved === "dark" || saved === "system") return saved;
    } catch {
      /* storage unavailable */
    }
    return "system";
  });

  useEffect(() => {
    applyTheme(choice);
    try {
      localStorage.setItem("pv-theme", choice);
    } catch {
      /* ignore */
    }
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const cycle = useCallback(
    () => setChoice((c) => (c === "system" ? "light" : c === "light" ? "dark" : "system")),
    [],
  );
  /** True when the window is dark right now (a "system" choice follows the computer). */
  const dark =
    choice === "dark" ||
    (choice === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return { choice, cycle, dark, setChoice };
}

/** Size of the interface font in px. Everything in the app is sized in rem, so this scales it all. */
export const APP_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18];
export const DEFAULT_APP_FONT = 12;
/** Storage key (the "-v2" starts everyone at the new default of 12 px). */
const FONT_KEY = "pw-app-font-v2";
/** The size the layout was designed at: prompt text sizes (px) are relative to it. */
const DESIGN_FONT = 18;

export interface AppFont {
  size: number;
  canDecrease: boolean;
  canIncrease: boolean;
  decrease: () => void;
  increase: () => void;
  set: (size: number) => void;
  reset: () => void;
}

function applyAppFont(size: number) {
  const root = document.documentElement;
  root.style.fontSize = `${size}px`;
  root.style.setProperty("--pw-scale", String(size / DESIGN_FONT));
}

// Applied before the first paint so the window never flashes at the wrong size.
try {
  const saved = Number(localStorage.getItem(FONT_KEY));
  applyAppFont(APP_FONT_SIZES.includes(saved) ? saved : DEFAULT_APP_FONT);
} catch {
  applyAppFont(DEFAULT_APP_FONT);
}

/** Overall font size of the whole app (left, middle and right panels). Remembered between launches. */
export function useAppFont(): AppFont {
  const [size, setSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(FONT_KEY));
      if (APP_FONT_SIZES.includes(saved)) return saved;
    } catch {
      /* storage unavailable */
    }
    return DEFAULT_APP_FONT;
  });

  const set = useCallback((next: number) => {
    if (!APP_FONT_SIZES.includes(next)) return;
    setSize(next);
    applyAppFont(next);
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const index = APP_FONT_SIZES.indexOf(size);
  return {
    size,
    canDecrease: index > 0,
    canIncrease: index < APP_FONT_SIZES.length - 1,
    decrease: () => index > 0 && set(APP_FONT_SIZES[index - 1]),
    increase: () => index < APP_FONT_SIZES.length - 1 && set(APP_FONT_SIZES[index + 1]),
    set,
    reset: () => set(DEFAULT_APP_FONT),
  };
}

export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 6000 : 2800);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Left panel expanded (false) or collapsed to icons (true). Remembered between launches. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pv-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("pv-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

export const TEXT_SIZES = [13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36];
const DEFAULT_TEXT_SIZE = 17;

export interface TextSize {
  size: number;
  canDecrease: boolean;
  canIncrease: boolean;
  decrease: () => void;
  increase: () => void;
  reset: () => void;
}

/** Font size (px) of the prompt text in the detail panel. Remembered between launches. */
export function useTextSize(): TextSize {
  const [size, setSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("pw-text-size"));
      if (TEXT_SIZES.includes(saved)) return saved;
    } catch {
      /* storage unavailable */
    }
    return DEFAULT_TEXT_SIZE;
  });

  const set = useCallback((next: number) => {
    setSize(next);
    try {
      localStorage.setItem("pw-text-size", String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const index = TEXT_SIZES.indexOf(size);
  return {
    size,
    canDecrease: index > 0,
    canIncrease: index < TEXT_SIZES.length - 1,
    decrease: () => index > 0 && set(TEXT_SIZES[index - 1]),
    increase: () => index < TEXT_SIZES.length - 1 && set(TEXT_SIZES[index + 1]),
    reset: () => set(DEFAULT_TEXT_SIZE),
  };
}
