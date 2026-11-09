import { useEffect } from "react";
import type { PromptSummary } from "../types";
import { Button } from "./ui";
import { LockIcon, PencilIcon, PlusIcon, StarIcon } from "./icons";

export function PromptList({
  title,
  subtitle,
  crumb,
  prompts,
  selectedId,
  favorites,
  onSelect,
  onNewPrompt,
  emptyHint,
  showCategory,
}: {
  title: string;
  subtitle?: string;
  /** Pack the category belongs to, shown above the title. */
  crumb?: string;
  prompts: PromptSummary[];
  selectedId: string | null;
  favorites: string[];
  onSelect: (id: string) => void;
  onNewPrompt?: () => void;
  emptyHint: string;
  showCategory?: boolean;
}) {
  // A prompt that was just saved (or opened from search) may be below the fold: bring it into view.
  useEffect(() => {
    if (selectedId) document.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId, prompts]);

  return (
    <section className="flex h-full w-80 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        {/* Full-width title, then (My Prompts only) a full-width New button. */}
        {crumb && <p className="mb-0.5 break-all text-xs font-medium text-indigo-700 dark:text-indigo-300">{crumb} ›</p>}
        <h2 className="break-words text-2xl font-semibold leading-snug">{title}</h2>
        {subtitle && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{subtitle}</p>}
        {onNewPrompt && (
          <Button variant="primary" onClick={onNewPrompt} className="mt-3 w-full !py-2.5 text-base">
            <PlusIcon size={17} /> New
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {prompts.length === 0 && (
          <p className="px-3 py-8 text-center text-base text-slate-500">{emptyHint}</p>
        )}
        <ul className="space-y-0.5">
          {prompts.map((p) => {
            const active = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  data-selected={active ? "true" : undefined}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(p.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? "bg-indigo-100 dark:bg-indigo-950/60"
                      : "hover:bg-slate-200/60 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-base font-medium">{p.title}</span>
                    {favorites.includes(p.id) && (
                      <span className="text-amber-500">
                        <StarIcon size={13} filled />
                      </span>
                    )}
                    <span
                      className="text-slate-400"
                      title={p.readOnly ? "Read-only (from a prompts pack)" : "Your prompt"}
                    >
                      {p.readOnly ? <LockIcon size={13} /> : <PencilIcon size={13} />}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{p.description}</p>
                  )}
                  {showCategory && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">{p.category}</p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
