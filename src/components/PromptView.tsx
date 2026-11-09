import { useEffect, useRef, useState } from "react";
import type { PromptDetail } from "../types";
import type { TextSize } from "../lib/hooks";
import { MOD } from "../lib/platform";
import { PROVIDERS, type Destination, type ProviderId } from "../lib/providers";
import { PromptBody } from "./PromptBody";
import { Badge, Button, Kbd } from "./ui";
import {
  ChevronDownIcon,
  CopyIcon,
  GlobeIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  PencilIcon,
  SparkIcon,
  StarIcon,
  TrashIcon,
} from "./icons";

function OpenInMenu({ onPick }: { onPick: (id: ProviderId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <GlobeIcon size={15} /> Open in… <ChevronDownIcon size={13} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-10 mb-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-600 dark:bg-slate-800"
        >
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(p.id);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {p.name}
            </button>
          ))}
          <p className="border-t border-slate-200 px-3 py-2 text-xs leading-snug text-slate-500 dark:border-slate-800">
            The prompt is copied first, then the site opens. Paste it if it is not filled in for you.
          </p>
        </div>
      )}
    </div>
  );
}

/** A- / A+ buttons for the prompt text. The size is remembered. */
export function TextSizeControl({ textSize }: { textSize: TextSize }) {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-700";
  return (
    <div
      role="group"
      aria-label="Text size"
      className="flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800"
    >
      <button
        type="button"
        onClick={textSize.decrease}
        disabled={!textSize.canDecrease}
        title="Smaller text"
        aria-label="Decrease text size"
        className={btn}
      >
        <MinusIcon size={15} />
      </button>
      <button
        type="button"
        onClick={textSize.reset}
        title="Reset text size"
        aria-label={`Text size ${textSize.size}. Click to reset`}
        className="min-w-[3.25rem] rounded-md px-1 py-1 text-center text-sm font-medium tabular-nums text-slate-700 hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {textSize.size} px
      </button>
      <button
        type="button"
        onClick={textSize.increase}
        disabled={!textSize.canIncrease}
        title="Larger text"
        aria-label="Increase text size"
        className={btn}
      >
        <PlusIcon size={15} />
      </button>
    </div>
  );
}

export function PromptView({
  detail,
  isFavorite,
  onCopy,
  onTemplate,
  onEdit,
  onDelete,
  onToggleFavorite,
  textSize,
  packName,
}: {
  detail: PromptDetail;
  isFavorite: boolean;
  onCopy: (destination: Destination) => void;
  onTemplate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  textSize: TextSize;
  /** Name the prompt's pack is shown under (not its folder). */
  packName?: string;
}) {
  const hasVars = detail.variables.length > 0;

  return (
    <article className="flex h-full min-w-0 flex-1 flex-col">
      <header className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 dir="auto" className="text-2xl font-semibold leading-snug">{detail.title}</h1>
            {detail.description && (
              <p dir="auto" className="mt-1 text-base text-slate-600 dark:text-slate-400">{detail.description}</p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {detail.readOnly ? (
                <Badge tone="amber">
                  <LockIcon size={12} /> {detail.pack ? "Prompts pack" : "Built-in"} · read-only
                </Badge>
              ) : (
                <Badge tone="indigo">
                  <PencilIcon size={11} /> Your prompt
                </Badge>
              )}
              {detail.derivedFromTitle && <Badge tone="indigo">Based on “{detail.derivedFromTitle}”</Badge>}
              {hasVars && (
                <Badge>
                  <SparkIcon size={11} /> {detail.variables.length}{" "}
                  {detail.variables.length === 1 ? "blank" : "blanks"} to fill
                </Badge>
              )}
              {detail.tags.map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={`rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${
              isFavorite ? "text-amber-500" : "text-slate-400"
            }`}
          >
            <StarIcon size={18} filled={isFavorite} />
          </button>
        </div>
        {detail.warning && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {detail.warning}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-500">Prompt text</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Text size</span>
            <TextSizeControl textSize={textSize} />
          </div>
        </div>
        {detail.body.trim() === "" ? (
          <p className="text-base text-slate-500">
            This prompt is empty. Click <span className="font-medium">Edit</span> to write it.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <PromptBody text={detail.body} fontSize={textSize.size} />
          </div>
        )}
        {detail.readOnly && (
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-500">
            <LockIcon size={13} className="mt-0.5 shrink-0" />
            <span>
              Prompts in a pack can’t be changed, so they always stay as published. Choose{" "}
              <span className="font-medium">Use as template</span> to make a copy you can edit.
            </span>
          </p>
        )}
        <p className="mt-4 break-all text-xs text-slate-500">
          {detail.pack ? `${packName ?? detail.pack} / ` : ""}{detail.category} / {detail.fileName}
          {detail.updated ? ` · updated ${detail.updated}` : ""}
        </p>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-6 py-3 dark:border-slate-800">
        <Button variant="primary" onClick={() => onCopy("clipboard")} title={`${MOD} + Shift + C`}>
          <CopyIcon size={15} /> {hasVars ? "Fill in & copy" : "Copy"}
        </Button>
        <Button onClick={onTemplate} title={`${MOD} + D`}>
          <SparkIcon size={15} /> Use as template
        </Button>
        <OpenInMenu onPick={(id) => onCopy(id)} />
        {!detail.readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onDelete}>
              <TrashIcon size={14} /> Delete
            </Button>
            <Button onClick={onEdit}>
              <PencilIcon size={14} /> Edit
            </Button>
          </div>
        )}
        {detail.readOnly && (
          <span className="ml-auto hidden text-xs text-slate-400 lg:block">
            <Kbd>{MOD}</Kbd> <Kbd>K</Kbd> to search
          </span>
        )}
      </footer>
    </article>
  );
}
