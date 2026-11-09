import { useMemo, useState } from "react";
import type { PromptDetail } from "../types";
import { errorMessage } from "../lib/api";
import { MOD } from "../lib/platform";
import { PROVIDERS, providerById, type Destination } from "../lib/providers";
import { humanizeVariable, renderTemplate } from "../lib/template";
import { PromptBody } from "./PromptBody";
import { Button, Field, Kbd, Modal, inputClass } from "./ui";

/** Fill in {{VARIABLES}}, see the result live, then copy (and optionally open an LLM website). */
export function CopyDialog({
  prompt,
  destination: initialDestination,
  onConfirm,
  onClose,
}: {
  prompt: PromptDetail;
  destination: Destination;
  onConfirm: (text: string, values: Record<string, string>, destination: Destination) => Promise<void>;
  onClose: () => void;
}) {
  // Every field starts empty: no remembered answers and no default text, so it is always clear
  // what is still to be filled in. A prompt's hint is shown as a note above the field instead.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(prompt.variables.map((v) => [v.name, ""])),
  );
  const [destination, setDestination] = useState<Destination>(initialDestination);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rendered = useMemo(() => renderTemplate(prompt.body, values), [prompt.body, values]);
  const label = destination === "clipboard" ? "Copy prompt" : `Copy & open ${providerById(destination).name}`;

  async function submit(text: string, vals: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text, vals, destination);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title="Fill in the blanks"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            disabled={busy}
            onClick={() => void submit(prompt.body, {})}
            title="Copy the template with {{ }} placeholders left in place"
          >
            Copy with {"{{ }}"}
          </Button>
          <select
            aria-label="Destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value as Destination)}
            className={`${inputClass} !w-auto`}
          >
            <option value="clipboard">Clipboard only</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                Open in {p.name}
              </option>
            ))}
          </select>
          <Button variant="primary" disabled={busy} onClick={() => void submit(rendered.text, values)}>
            {label}
          </Button>
        </>
      }
    >
      <div
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) {
            e.preventDefault();
            void submit(rendered.text, values);
          }
        }}
      >
        <p className="mb-3 text-base text-slate-700 dark:text-slate-300">
          <span className="font-medium text-slate-800 dark:text-slate-200">{prompt.title}</span>
          {" · "}
          Empty fields stay as {"{{NAME}}"} in the copied text.
        </p>

        <div className="grid gap-x-4 sm:grid-cols-2">
          {prompt.variables.map((v) => (
            <Field key={v.name} label={v.label || humanizeVariable(v.name)} hint={v.placeholder ? `Hint: ${v.placeholder}` : undefined}>
              <textarea
                dir="auto"
                rows={2}
                className={`${inputClass} resize-y`}
                value={values[v.name] ?? ""}
                onChange={(e) => setValues((cur) => ({ ...cur, [v.name]: e.target.value }))}
              />
            </Field>
          ))}
        </div>

        <div className="mb-1 flex items-center justify-between text-base font-semibold text-slate-800 dark:text-slate-200">
          <span>Preview</span>
          {rendered.unfilled.length > 0 ? (
            <span className="text-amber-700 dark:text-amber-400">
              {rendered.unfilled.length} empty {rendered.unfilled.length === 1 ? "field" : "fields"}
            </span>
          ) : (
            <span className="text-emerald-700 dark:text-emerald-400">All fields filled</span>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <PromptBody text={rendered.text} tone="amber" />
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        <p className="mt-3 text-base text-slate-700 dark:text-slate-300">
          <Kbd>{MOD}</Kbd> + <Kbd>Enter</Kbd> to copy
        </p>
      </div>
    </Modal>
  );
}
