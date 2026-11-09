import { useEffect, useRef, useState, type ReactNode } from "react";
import { MOD } from "../lib/platform";
import { DownloadIcon, FolderIcon, PencilIcon } from "./icons";
import { Kbd } from "./ui";

const topButton =
  "rounded-md px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800";

function Item({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:text-slate-100 dark:hover:bg-slate-700 dark:focus:bg-slate-700"
    >
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {shortcut}
    </button>
  );
}

/**
 * The menu bar at the very top of the window, like in other desktop apps: "File" opens a
 * menu, "About" opens the About dialog, "Settings" the theme, font size and AI key.
 */
export function MenuBar({
  onNewPrompt,
  onNewCategory,
  onImportPack,
  onAbout,
  onSettings,
}: {
  onNewPrompt: () => void;
  onNewCategory: () => void;
  onImportPack: () => void;
  onAbout: () => void;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div
      role="menubar"
      aria-label="Menu"
      className="flex h-10 shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-100 px-2 dark:border-slate-800 dark:bg-slate-950"
    >
      <div ref={ref} className="relative">
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${topButton} ${open ? "bg-slate-200/70 dark:bg-slate-800" : ""}`}
        >
          File
        </button>
        {open && (
          <div
            role="menu"
            aria-label="File"
            className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-800"
          >
            <Item
              icon={<PencilIcon size={16} />}
              label="Create New Prompt"
              shortcut={
                <span className="flex gap-1">
                  <Kbd>{MOD}</Kbd>
                  <Kbd>N</Kbd>
                </span>
              }
              onClick={choose(onNewPrompt)}
            />
            <Item icon={<FolderIcon size={16} />} label="Create New Category" onClick={choose(onNewCategory)} />
            <div className="my-1 border-t border-slate-200 dark:border-slate-600" role="separator" />
            <Item icon={<DownloadIcon size={16} />} label="Import Prompts Pack…" onClick={choose(onImportPack)} />
          </div>
        )}
      </div>
      <button type="button" role="menuitem" onClick={onAbout} className={topButton}>
        About
      </button>
      <button type="button" role="menuitem" onClick={onSettings} className={topButton}>
        Settings
      </button>
    </div>
  );
}
