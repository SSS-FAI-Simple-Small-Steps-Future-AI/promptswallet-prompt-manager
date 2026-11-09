import { useEffect, useMemo, useRef, useState } from "react";
import type { PromptSummary, Tree, UserState } from "../types";
import { api } from "../lib/api";
import { useDebounced } from "../lib/hooks";
import { MOD } from "../lib/platform";
import { Kbd } from "./ui";
import { LockIcon, PencilIcon, SearchIcon } from "./icons";

/** Ctrl/Cmd+K: find a prompt by typing, Enter copies it, Ctrl/Cmd+Enter opens it. */
export function CommandPalette({
  tree,
  userState,
  onClose,
  onCopy,
  onOpen,
}: {
  tree: Tree | null;
  userState: UserState;
  onClose: () => void;
  onCopy: (p: PromptSummary) => void;
  onOpen: (p: PromptSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ q: string; items: PromptSummary[] }>({ q: "", items: [] });
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = query.trim();
  const q = useDebounced(typed, 120);

  // Empty query: show favorites and recent prompts.
  const suggestions = useMemo(() => {
    const byId = new Map<string, PromptSummary>();
    for (const c of [...(tree?.packs.flatMap((p) => p.categories) ?? []), ...(tree?.mine ?? [])])
      for (const p of c.prompts) byId.set(p.id, p);
    const ids = [...new Set([...userState.recents, ...userState.favorites])];
    return ids.map((id) => byId.get(id)).filter((p): p is PromptSummary => !!p).slice(0, 8);
  }, [tree, userState]);

  useEffect(() => {
    let cancelled = false;
    if (!q) {
      setHits({ q: "", items: [] });
      return;
    }
    api
      .searchPrompts(q)
      .then((r) => {
        if (!cancelled) setHits({ q, items: r.map((h) => h.prompt) });
      })
      .catch(() => {
        if (!cancelled) setHits({ q, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  // While the search for the latest keystroke is still running, the previous results stay on
  // screen, but Enter never acts on them (see activate below).
  const fresh = typed !== "" && hits.q === typed;
  const results = typed === "" ? suggestions : hits.items;
  const current = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current, results]);

  /** Enter: act on the highlighted row, or, if results are out of date, on the best fresh match. */
  async function activate(open: boolean) {
    let list = results;
    let index = current;
    if (typed !== "" && !fresh) {
      try {
        list = (await api.searchPrompts(typed)).map((h) => h.prompt);
      } catch {
        return;
      }
      index = 0;
    }
    const p = list[index];
    if (!p) return;
    if (open) onOpen(p);
    else onCopy(p);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void activate(e.metaKey || e.ctrlKey);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-slate-950/50 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search prompts"
        onKeyDown={onKeyDown}
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-800"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <SearchIcon size={16} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, tag or text…"
            aria-label="Search prompts"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {typed === "" && results.length > 0 && (
            <li className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recent and favorites
            </li>
          )}
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-slate-500">
              {typed === ""
                ? "Type to search. Prompts you copy or star show up here."
                : fresh
                  ? "No prompts match."
                  : "Searching…"}
            </li>
          )}
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                data-active={i === current}
                onMouseMove={() => setActive(i)}
                onClick={() => onCopy(p)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  i === current ? "bg-indigo-50 dark:bg-indigo-950/50" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-slate-500">{p.category}</span>
                </span>
                {p.variableCount > 0 && (
                  <span className="shrink-0 text-xs text-slate-400">{p.variableCount} blanks</span>
                )}
                <span className="shrink-0 text-slate-400">
                  {p.readOnly ? <LockIcon size={12} /> : <PencilIcon size={12} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
          <span><Kbd>↵</Kbd> copy</span>
          <span><Kbd>{MOD}</Kbd> <Kbd>↵</Kbd> open</span>
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> move</span>
          <span className="ml-auto"><Kbd>Esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}
