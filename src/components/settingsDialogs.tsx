import { useEffect, useRef, useState } from "react";
import { api, errorMessage, openExternal } from "../lib/api";
import { ABOUT } from "../lib/about";
import { APP_FONT_SIZES, DEFAULT_APP_FONT } from "../lib/hooks";
import { DEFAULT_NVIDIA_MODEL, NVIDIA_MODELS, TARGET_LLMS, getNvidiaKey, getTargetLlm, setTargetLlm } from "../lib/settings";
import { AlertIcon, ExternalLinkIcon, MinusIcon, MoonIcon, PlusIcon, SparkIcon, SunIcon } from "./icons";
import { Button, Field, InfoButton, Modal, inputClass } from "./ui";
import { CheckIcon } from "./icons";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-200 pb-5 pt-4 first:pt-0 last:border-b-0 last:pb-0 dark:border-slate-700">
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      {hint && <p className="mb-3 mt-0.5 text-base text-slate-700 dark:text-slate-300">{hint}</p>}
      {children}
    </section>
  );
}

/**
 * "Settings" in the menu bar: theme, overall font size and the key for "Rewrite with AI".
 * Changes are only collected here; nothing changes in the app until Save is pressed. The cross
 * (and Esc) close the dialog and throw the changes away.
 */
export function SettingsDialog({
  dark,
  fontSize,
  onSave,
  onClose,
}: {
  /** Whether the window is dark right now (a saved "system" choice follows the computer). */
  dark: boolean;
  /** Current overall font size in px. */
  fontSize: number;
  onSave: (changes: { theme: "light" | "dark"; fontSize: number; nvidiaKey: string }) => void;
  onClose: () => void;
}) {
  const savedKey = useRef(getNvidiaKey()).current;
  const [mode, setMode] = useState<"light" | "dark">(dark ? "dark" : "light");
  const [size, setSize] = useState(fontSize);
  const [key, setKey] = useState(savedKey);

  const changed = mode !== (dark ? "dark" : "light") || size !== fontSize || key.trim() !== savedKey;
  const index = APP_FONT_SIZES.indexOf(size);
  const modes = [
    { id: "light" as const, label: "Light", icon: <SunIcon size={17} /> },
    { id: "dark" as const, label: "Dark", icon: <MoonIcon size={17} /> },
  ];
  const stepBtn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
  const link =
    "inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline dark:text-indigo-300";

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      wide
      closeX
      footer={
        <Button
          variant="primary"
          disabled={!changed}
          onClick={() => onSave({ theme: mode, fontSize: size, nvidiaKey: key.trim() })}
        >
          Save
        </Button>
      }
    >
      <Section title="App theme" hint="Light or dark colours for the whole app.">
        <div role="radiogroup" aria-label="App theme" className="flex gap-2">
          {modes.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-theme-choice={m.id}
                onClick={() => setMode(m.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-base font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Font size"
        hint="Makes the text smaller or bigger in the left, middle and right panels, the menus and the dialogs."
      >
        <div className="flex items-center gap-2" role="group" aria-label="App font size">
          <button
            type="button"
            onClick={() => index > 0 && setSize(APP_FONT_SIZES[index - 1])}
            disabled={index <= 0}
            title="Smaller"
            aria-label="Decrease app font size"
            className={stepBtn}
          >
            <MinusIcon size={16} />
          </button>
          <span
            data-testid="app-font-size"
            className="min-w-[4.5rem] text-center text-base font-semibold tabular-nums"
            aria-live="polite"
          >
            {size} px
          </span>
          <button
            type="button"
            onClick={() => index < APP_FONT_SIZES.length - 1 && setSize(APP_FONT_SIZES[index + 1])}
            disabled={index >= APP_FONT_SIZES.length - 1}
            title="Bigger"
            aria-label="Increase app font size"
            className={stepBtn}
          >
            <PlusIcon size={16} />
          </button>
          <Button
            variant="ghost"
            onClick={() => setSize(DEFAULT_APP_FONT)}
            disabled={size === DEFAULT_APP_FONT}
            className="ml-2"
          >
            Reset ({DEFAULT_APP_FONT} px)
          </Button>
        </div>
        <p
          style={{ fontSize: `${size}px` }}
          className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-serif leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      </Section>

      <Section title="AI rewrite" hint="Why “Rewrite with AI” asks for an NVIDIA API key">
        <div className="mb-3 text-base leading-relaxed text-slate-700 dark:text-slate-300">
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <strong className="font-semibold">Rewrite with AI</strong> needs your own free{" "}
              <strong className="font-semibold">NVIDIA API key</strong>: NVIDIA only accepts requests that come with
              one, and PromptsWallet has no key of its own. Create it once and paste it below.
            </span>
            <InfoButton title="Why an NVIDIA API key?">
              <p>
                <strong>Rewrite with AI</strong> improves a prompt for the AI model you choose (Claude, ChatGPT,
                Gemini…): it removes filler so the prompt costs fewer tokens and spells out what the model should do,
                so you get better answers.
              </p>
              <p>
                The rewriting is done by a free AI model hosted on NVIDIA&apos;s cloud. NVIDIA only lets a request in
                when it comes with an <strong>API key</strong>, a personal password that identifies your free NVIDIA
                account. PromptsWallet has no key of its own, so it needs yours. The key is free: sign in at NVIDIA,
                create it once and paste it in Settings.
              </p>
              <p>
                The key stays on this computer and is sent only to NVIDIA. When you rewrite, the prompt text and the
                goal you type are sent to NVIDIA too; nothing else is. Without a key the rest of the app works as
                usual.
              </p>
            </InfoButton>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <button type="button" onClick={() => void openExternal(ABOUT.nvidiaModelsUrl)} className={link}>
              Browse NVIDIA&apos;s free models <ExternalLinkIcon size={12} />
            </button>
            <button type="button" onClick={() => void openExternal(ABOUT.nvidiaKeysUrl)} className={link}>
              Get your free API key <ExternalLinkIcon size={12} />
            </button>
          </p>
        </div>
        <Field label="NVIDIA API key">
          <input
            id="nvidia-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
            value={key}
            placeholder="nvapi-…"
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
      </Section>
    </Modal>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-400"
    />
  );
}

/**
 * "Rewrite with AI": asks what the prompt is for and which LLM to tune it for, shows a loading view
 * while the NVIDIA API works, and hands the new text back. Errors stay in the dialog so the user can
 * adjust and try again; the prompt text is only replaced on success.
 */
export function RewriteDialog({
  text,
  onDone,
  onClose,
}: {
  text: string;
  onDone: (rewritten: string) => void;
  onClose: () => void;
}) {
  const [context, setContext] = useState("");
  const [llm, setLlm] = useState(getTargetLlm);
  // Always starts on the default model; after an error the user can pick another and try again.
  const [model, setModel] = useState(DEFAULT_NVIDIA_MODEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const errorBox = useRef<HTMLDivElement>(null);
  // The error sits below the fields: make sure it is in view on small screens.
  useEffect(() => {
    if (error) errorBox.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const contextMissing = context.trim() === "";
  const modelLabel = NVIDIA_MODELS.find((m) => m.id === model)?.label ?? model;

  async function run() {
    if (busy || contextMissing) return;
    setBusy(true);
    setError(null);
    setTargetLlm(llm);
    try {
      const out = await api.rewritePrompt(text, context.trim(), llm, model);
      if (alive.current) onDone(out);
    } catch (e) {
      if (!alive.current) return;
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Rewrite with AI"
      onClose={onClose}
      wide
      footer={
        busy ? (
          <Button onClick={onClose}>Cancel</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={contextMissing}
              title={contextMissing ? "Describe what this prompt is for first" : undefined}
              onClick={() => void run()}
            >
              <SparkIcon size={15} /> Rewrite
            </Button>
          </>
        )
      }
    >
      {busy ? (
        <div role="status" aria-live="polite" data-testid="rewrite-loading" className="flex flex-col items-center gap-4 py-10 text-center">
          <Spinner />
          <div>
            <p className="font-serif text-lg font-semibold">Rewriting your prompt for {llm} with {modelLabel}…</p>
            <p className="mt-1 text-base text-slate-700 dark:text-slate-300">This usually takes a few seconds, sometimes up to a minute.</p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <p className="mb-3 text-base text-slate-700 dark:text-slate-300">
            The AI makes your prompt shorter and clearer for the model you choose. Your text is replaced only when
            it succeeds, and you can undo it afterwards.
          </p>
          <Field
            label="What do you want to achieve with this prompt? (required)"
            hint="Required: what the prompt is about, the goal, the audience, any key terms it must keep."
          >
            <textarea
              id="rewrite-context"
              dir="auto"
              rows={4}
              maxLength={2000}
              required
              aria-required="true"
              aria-invalid={contextMissing && error !== null}
              className={`${inputClass} resize-y`}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Weekly newsletter for engineers: friendly, 300 words, keep the term “prompt caching”"
            />
          </Field>
          <Field label="Optimize for">
            <select
              id="rewrite-llm"
              className={inputClass}
              value={llm}
              onChange={(e) => setLlm(e.target.value)}
            >
              {TARGET_LLMS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <div className="mb-3.5">
            <span id="rewrite-model-label" className="mb-1 block text-base font-semibold text-slate-800 dark:text-slate-200">
              NVIDIA model
            </span>
            <ModelSelect value={model} onChange={setModel} />
            <div className="mt-1 flex items-start gap-2 text-base text-slate-700 dark:text-slate-300">
              <span className="min-w-0 flex-1">
                <strong className="font-semibold">Free to use:</strong> every model in this list runs on NVIDIA&apos;s
                free endpoints, so there is no charge for rewriting.
              </span>
              <InfoButton title="NVIDIA free endpoints">
                <p>
                  Free to use: every model in this list runs on NVIDIA&apos;s free endpoints, so there is no charge
                  for rewriting. NVIDIA may limit how many requests you can make.
                </p>
                <p>
                  For updated details, visit the link:{" "}
                  <button
                    type="button"
                    onClick={() => void openExternal(ABOUT.nvidiaModelsUrl)}
                    className="break-all font-semibold text-indigo-700 underline dark:text-indigo-300"
                  >
                    {ABOUT.nvidiaModelsUrl}
                  </button>
                </p>
              </InfoButton>
            </div>
            <p className="mt-1 text-base text-slate-700 dark:text-slate-300">
              For updated details, visit the link:{" "}
              <button
                type="button"
                onClick={() => void openExternal(ABOUT.nvidiaModelsUrl)}
                className="break-all font-medium text-indigo-700 hover:underline dark:text-indigo-300"
              >
                {ABOUT.nvidiaModelsUrl}
              </button>
            </p>
          </div>
          {error && (
            <div
              ref={errorBox}
              role="alert"
              className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              <p className="flex items-start gap-2">
                <AlertIcon size={17} className="mt-0.5 shrink-0" /> <span>{error}</span>
              </p>
              <p className="mt-1.5 pl-[25px] text-base">
                Not working? Pick a different model in the <strong>NVIDIA model</strong> list above and press Rewrite
                again.
              </p>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}

/**
 * Shown instead of the rewrite dialog when no NVIDIA API key is saved yet. The key is only ever
 * entered in Settings, so this sends the user there.
 */
export function NeedKeyDialog({ onSettings, onClose }: { onSettings: () => void; onClose: () => void }) {
  return (
    <Modal
      title="NVIDIA API key needed"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSettings}>
            Go to Settings
          </Button>
        </>
      }
    >
      <p className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-3 py-2.5 text-base text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertIcon size={18} className="mt-0.5 shrink-0" />
        <span>
          “Rewrite with AI” needs your free NVIDIA API key, and you have not added one yet.
        </span>
      </p>
      <p className="mt-3 text-base text-slate-700 dark:text-slate-300">
        Open <strong>Settings</strong> in the menu bar, paste your key in the <strong>AI rewrite</strong> section and
        press <strong>Save</strong>. Then click Rewrite with AI again. Your prompt stays as it is.
      </p>
    </Modal>
  );
}

/**
 * A dropdown for the NVIDIA model. Each choice shows three lines: the model's name, what it is
 * meant for, and its model id (a plain <select> cannot show that). The list opens in the flow of
 * the dialog (not as a floating layer) so the dialog's scrolling never clips it. Keyboard: Up/Down,
 * Home/End, Enter or Space to choose, Escape to close.
 */
function ModelSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = Math.max(0, NVIDIA_MODELS.findIndex((m) => m.id === value));
  const current = NVIDIA_MODELS[selected];

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // Opening brings the dropdown to the top of the dialog so most of the list is visible.
  useEffect(() => {
    if (open) root.current?.scrollIntoView({ block: "start" });
  }, [open]);
  useEffect(() => {
    if (open) root.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function choose(i: number) {
    onChange(NVIDIA_MODELS[i].id);
    setOpen(false);
    root.current?.querySelector<HTMLElement>("button")?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const last = NVIDIA_MODELS.length - 1;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive(selected);
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(last, a + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === "Home") (e.preventDefault(), setActive(0));
    else if (e.key === "End") (e.preventDefault(), setActive(last));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), choose(active));
    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setOpen(false));
    else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        id="rewrite-model"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="rewrite-model-list"
        aria-labelledby="rewrite-model-label rewrite-model"
        data-value={current.id}
        onClick={() => {
          setActive(selected);
          setOpen((o) => !o);
        }}
        className={`${inputClass} flex items-center justify-between gap-3 text-left`}
      >
        <span className="min-w-0">
          <span className="block font-medium">{current.label}</span>
          <span className="block text-base text-slate-700 dark:text-slate-300">{current.role}</span>
        </span>
        <span aria-hidden className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <ul
          id="rewrite-model-list"
          role="listbox"
          aria-labelledby="rewrite-model-label"
          className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-300 bg-white dark:divide-slate-800 dark:border-slate-600 dark:bg-slate-800"
        >
          {NVIDIA_MODELS.map((m, i) => {
            const isSel = m.id === value;
            return (
              <li
                key={m.id}
                role="option"
                aria-selected={isSel}
                data-active={i === active}
                data-model-id={m.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-start gap-3 px-3 py-2 ${
                  i === active ? "bg-indigo-50 dark:bg-indigo-950/50" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{m.label}</span>
                  <span className="block text-base text-slate-700 dark:text-slate-300">Intended role: {m.role}</span>
                  <span className="block break-all font-mono text-base text-slate-700 dark:text-slate-300">
                    Model ID: {m.id}
                  </span>
                </span>
                {isSel && <CheckIcon size={16} className="mt-1 shrink-0 text-indigo-600 dark:text-indigo-300" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
