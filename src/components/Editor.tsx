import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PromptDetail, PromptUpdate, VariableDef } from "../types";
import { api, errorMessage } from "../lib/api";
import { useDebounced, type TextSize } from "../lib/hooks";
import { extractVariables, humanizeVariable } from "../lib/template";
import { PromptBody, scaledPx } from "./PromptBody";
import { NeedKeyDialog, RewriteDialog } from "./settingsDialogs";
import { getNvidiaKey } from "../lib/settings";
import { TextSizeControl } from "./PromptView";
import { Badge, Button, inputClass } from "./ui";
import { ArrowLeftIcon, CheckIcon, CopyIcon, SparkIcon, TrashIcon, UndoIcon } from "./icons";

interface Draft {
  title: string;
  description: string;
  tags: string;
  body: string;
  variables: VariableDef[];
}

function toUpdate(d: Draft): PromptUpdate {
  return {
    title: d.title,
    description: d.description,
    tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
    variables: d.variables,
    body: d.body,
  };
}

type Status = "saved" | "saving" | "error";

/**
 * Editor for the user's own prompts, in two modes:
 * - editing a saved prompt: saves automatically a moment after you stop typing; Done, Copy, Delete;
 * - writing a new prompt (`isNew`): nothing exists on disk yet. **Save** creates it, **Cancel**
 *   throws the draft away. No autosave, no Copy, no Delete.
 * Both have "Rewrite with AI" next to the main button.
 */
export function Editor({
  detail,
  isNew = false,
  onSaved,
  onSaveNew,
  onClose,
  onCancel,
  onDirtyChange,
  onCopy,
  onDelete,
  onReverted,
  onError,
  onOpenSettings,
  textSize,
}: {
  detail: PromptDetail;
  isNew?: boolean;
  onSaved: (d: PromptDetail) => void;
  /** New prompts: creates the prompt from the draft. Throws (with a readable message) when it fails. */
  onSaveNew?: (update: PromptUpdate) => Promise<void>;
  onClose: () => void;
  /** New prompts: discards the draft. */
  onCancel?: () => void;
  /** New prompts: tells the app whether the draft has anything worth asking about before leaving. */
  onDirtyChange?: (dirty: boolean) => void;
  onCopy: () => void;
  onDelete: () => void;
  onReverted: (d: PromptDetail) => void;
  onError: (message: string) => void;
  /** Opens the Settings dialog (where the NVIDIA API key is entered). */
  onOpenSettings: () => void;
  textSize: TextSize;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    title: detail.title,
    description: detail.description,
    tags: detail.tags.join(", "),
    body: detail.body,
    variables: detail.variables,
  }));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [status, setStatus] = useState<Status>("saved");
  const [newVar, setNewVar] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // What was last written to disk / is being written, as JSON, to compare cheaply.
  const savedKey = useRef(JSON.stringify(toUpdate(draft)));
  const inFlightKey = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const callbacks = useRef({ onSaved, onError });
  callbacks.current = { onSaved, onError };
  const id = detail.id;

  const save = useCallback(
    async (d: Draft): Promise<boolean> => {
      const update = toUpdate(d);
      const key = JSON.stringify(update);
      if (key === savedKey.current) return true;
      if (key === inFlightKey.current) return true;
      inFlightKey.current = key;
      setStatus("saving");
      try {
        const saved = await api.savePrompt(id, update);
        savedKey.current = key;
        setStatus("saved");
        callbacks.current.onSaved(saved);
        return true;
      } catch (e) {
        setStatus("error");
        callbacks.current.onError(errorMessage(e));
        return false;
      } finally {
        if (inFlightKey.current === key) inFlightKey.current = null;
      }
    },
    [id],
  );

  // Autosave 0.7 s after the last change.
  const settled = useDebounced(draft, 700);
  useEffect(() => {
    if (!isNew) void save(settled);
  }, [settled, save, isNew]);

  // Switching to another prompt (or closing) must not lose the last keystrokes.
  useEffect(
    () => () => {
      if (isNew) return; // a draft that was not saved is simply dropped
      const key = JSON.stringify(toUpdate(draftRef.current));
      if (key !== savedKey.current && key !== inFlightKey.current) {
        api
          .savePrompt(id, toUpdate(draftRef.current))
          .then((d) => callbacks.current.onSaved(d))
          .catch(() => undefined);
      }
    },
    [id, isNew],
  );

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  // New prompt: is there anything to lose? (Anything typed or changed since the draft was opened.)
  const startKey = useRef(JSON.stringify(toUpdate(draft)));
  const draftDirty = JSON.stringify(toUpdate(draft)) !== startKey.current;
  useEffect(() => {
    if (isNew) onDirtyChange?.(draftDirty);
  }, [isNew, draftDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // ---- Save (new prompts) ----
  const [creating, setCreating] = useState(false);
  async function saveNew() {
    if (!onSaveNew || creating) return;
    setCreating(true);
    try {
      await onSaveNew(toUpdate(draftRef.current));
    } catch (e) {
      onError(errorMessage(e));
      setCreating(false);
    }
  }

  // ---- Rewrite with AI ----
  // The button opens a dialog (goal + LLM); the text is replaced only when the AI call succeeds.
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [needKey, setNeedKey] = useState(false);
  const [beforeRewrite, setBeforeRewrite] = useState<string | null>(null);
  const closeRewrite = useCallback(() => setRewriteOpen(false), []);
  function applyRewrite(text: string) {
    setBeforeRewrite(draftRef.current.body);
    setDraft((d) => ({ ...d, body: text }));
    setTab("write");
    setRewriteOpen(false);
    requestAnimationFrame(() => bodyRef.current?.focus());
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const names = useMemo(() => extractVariables(draft.body), [draft.body]);
  const defFor = (name: string): VariableDef =>
    draft.variables.find((v) => v.name === name) ?? { name };

  function patchVar(name: string, patch: Partial<VariableDef>) {
    setDraft((d) => {
      const exists = d.variables.some((v) => v.name === name);
      const variables = exists
        ? d.variables.map((v) => (v.name === name ? { ...v, ...patch } : v))
        : [...d.variables, { name, ...patch }];
      return { ...d, variables };
    });
  }

  function insertVariable() {
    const name = newVar.trim().replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/g, "").toUpperCase();
    if (!name) return;
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    setDraft((d) => {
      const start = el?.selectionStart ?? d.body.length;
      const end = el?.selectionEnd ?? d.body.length;
      return { ...d, body: d.body.slice(0, start) + token + d.body.slice(end) };
    });
    setNewVar("");
    setTab("write");
    requestAnimationFrame(() => el?.focus());
  }

  async function finish(then: () => void) {
    if (await save(draftRef.current)) then();
  }

  async function revert() {
    try {
      const restored = await api.revertToOriginal(id);
      savedKey.current = JSON.stringify({
        ...toUpdate(draftRef.current),
        body: restored.body,
        variables: restored.variables,
      });
      onReverted(restored);
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  const dirty = JSON.stringify(toUpdate(draft)) !== savedKey.current;
  const statusText = isNew
    ? creating
      ? "Saving…"
      : "Not saved yet"
    : status === "error"
      ? "Not saved"
      : status === "saving"
        ? "Saving…"
        : dirty
          ? "Unsaved changes"
          : "Saved";

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        {isNew ? (
          <Button variant="secondary" disabled={creating} onClick={() => onCancel?.()}>
            Cancel
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => void finish(onClose)}>
            <ArrowLeftIcon size={15} /> Done
          </Button>
        )}
        <Badge tone="indigo">{isNew ? "New prompt" : "Editing"}</Badge>
        {detail.derivedFromTitle && (
          <span className="hidden truncate text-xs text-slate-500 md:block">
            based on “{detail.derivedFromTitle}”
          </span>
        )}
        <span
          aria-live="polite"
          className={`ml-auto text-xs ${status === "error" ? "text-red-600" : "text-slate-500"}`}
        >
          {statusText}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          <input
            dir="auto"
            aria-label="Title"
            className={`${inputClass} !border-transparent !px-0 text-xl font-semibold !ring-0 hover:!border-slate-300 focus:!border-indigo-500 focus:!px-3 dark:hover:!border-slate-700`}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Title"
          />
          <input
            dir="auto"
            aria-label="Description"
            className={inputClass}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What is this prompt for? (one line)"
          />
          <input
            aria-label="Tags"
            className={inputClass}
            value={draft.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="Tags, separated by commas"
          />

          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium capitalize ${
                  tab === t
                    ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
            <div className="ml-auto pb-1">
              <TextSizeControl textSize={textSize} />
            </div>
          </div>

          {tab === "write" ? (
            <textarea
              ref={bodyRef}
              dir="auto"
              aria-label="Prompt text"
              spellCheck
              value={draft.body}
              onChange={(e) => {
                setBeforeRewrite(null);
                set("body", e.target.value);
              }}
              placeholder={"Write your prompt here.\nUse {{NAME}} for a blank you want to fill in each time."}
              style={{ fontSize: scaledPx(textSize.size) }}
              className={`${inputClass} min-h-[16rem] flex-1 resize-none font-serif leading-relaxed`}
            />
          ) : (
            <div className="min-h-[16rem] flex-1 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
              {draft.body.trim() ? (
                <PromptBody text={draft.body} fontSize={textSize.size} />
              ) : (
                <p className="text-base text-slate-500">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>

        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 p-4 lg:flex dark:border-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blanks to fill in</h2>
          <div className="flex gap-1.5">
            <input
              aria-label="New blank name"
              className={`${inputClass} !py-1.5`}
              value={newVar}
              onChange={(e) => setNewVar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insertVariable();
                }
              }}
              placeholder="Add: e.g. AUDIENCE"
            />
            <Button onClick={insertVariable} disabled={!newVar.trim()}>
              Add
            </Button>
          </div>
          {names.length === 0 ? (
            <p className="text-xs leading-relaxed text-slate-500">
              Type <span className="font-mono">{"{{NAME}}"}</span> anywhere in the prompt (or use Add) and it
              becomes a field you fill in each time you copy.
            </p>
          ) : (
            names.map((name) => {
              const d = defFor(name);
              return (
                <div key={name} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                  <div className="mb-1.5 font-mono text-xs text-indigo-700 dark:text-indigo-300">{`{{${name}}}`}</div>
                  <input
                    aria-label={`${name} label`}
                    className={`${inputClass} mb-1.5 !py-1 text-xs`}
                    value={d.label ?? ""}
                    placeholder={humanizeVariable(name)}
                    onChange={(e) => patchVar(name, { label: e.target.value })}
                  />
                  <input
                    aria-label={`${name} hint`}
                    className={`${inputClass} mb-1.5 !py-1 text-xs`}
                    value={d.placeholder ?? ""}
                    placeholder="Hint (optional)"
                    onChange={(e) => patchVar(name, { placeholder: e.target.value })}
                  />
                  <input
                    aria-label={`${name} default`}
                    className={`${inputClass} !py-1 text-xs`}
                    value={d.default ?? ""}
                    placeholder="Default value (optional)"
                    onChange={(e) => patchVar(name, { default: e.target.value })}
                  />
                </div>
              );
            })
          )}
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2.5 dark:border-slate-800">
        {isNew ? (
          <Button variant="primary" disabled={creating} onClick={() => void saveNew()}>
            <CheckIcon size={15} /> {creating ? "Saving…" : "Save"}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void finish(onCopy)}>
            <CopyIcon size={15} /> Copy
          </Button>
        )}
        <Button
          onClick={() => (getNvidiaKey() ? setRewriteOpen(true) : setNeedKey(true))}
          disabled={!draft.body.trim() || creating}
          title={
            draft.body.trim()
              ? "Rewrite this prompt with AI for the LLM you choose"
              : "Write some prompt text first"
          }
        >
          <SparkIcon size={15} /> Rewrite with AI
        </Button>
        {beforeRewrite !== null && (
          <Button
            variant="ghost"
            onClick={() => {
              set("body", beforeRewrite);
              setBeforeRewrite(null);
            }}
            title="Put your original text back"
          >
            <UndoIcon size={14} /> Undo rewrite
          </Button>
        )}
        {!isNew && detail.derivedFrom && detail.derivedFromTitle && (
          <Button onClick={() => void revert()} title="Replace the text with the original template">
            <UndoIcon size={14} /> Revert to original
          </Button>
        )}
        {!isNew && (
          <Button variant="ghost" className="ml-auto" onClick={onDelete}>
            <TrashIcon size={14} /> Delete
          </Button>
        )}
      </footer>

      {needKey && (
        <NeedKeyDialog
          onClose={() => setNeedKey(false)}
          onSettings={() => {
            setNeedKey(false);
            onOpenSettings();
          }}
        />
      )}
      {rewriteOpen && <RewriteDialog text={draft.body} onDone={applyRewrite} onClose={closeRewrite} />}
    </section>
  );
}
