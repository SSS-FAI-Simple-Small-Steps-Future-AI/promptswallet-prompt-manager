import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Toast } from "../lib/hooks";
import { CheckIcon, InfoIcon, XIcon } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900/60",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  ghost:
    "text-slate-600 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800",
  danger:
    "border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-base font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed dark:focus-visible:ring-offset-slate-900 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
  stacked = false,
  closeX = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Opens on top of another dialog. */
  stacked?: boolean;
  /** Shows a cross button at the top right that closes the dialog. */
  closeX?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // An open dropdown inside the dialog closes first (it handles Escape itself).
        if ((e.target as HTMLElement | null)?.closest?.('[aria-expanded="true"]')) return;
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${stacked ? "z-[45]" : "z-40"} flex items-start justify-center bg-slate-950/50 p-4 pt-[10vh] backdrop-blur-[2px]`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[80vh] w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800 ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 font-serif text-xl font-semibold dark:border-slate-800">
          <span>{title}</span>
          {closeX && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close without saving"
              className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-sans text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            >
              <XIcon size={18} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1 block text-base font-semibold text-slate-800 dark:text-slate-200">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-base text-slate-700 dark:text-slate-300">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  // Bottom-left: the editor's Save / Copy buttons live at the bottom of the middle and right panels.
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto flex max-w-lg items-center gap-2 rounded-xl px-4 py-2.5 text-base shadow-lg ${
            t.kind === "error"
              ? "bg-red-600 text-white"
              : t.kind === "success"
                ? "bg-emerald-600 text-white"
                : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          }`}
        >
          {t.kind === "success" && <CheckIcon size={16} />}
          <span className="text-left">{t.message}</span>
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      {children}
    </kbd>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "amber" | "indigo";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * A small "i" button for texts that are too long to show in place: it opens the full text in a
 * separate dialog on top, in a bigger and more readable layout.
 */
export function InfoButton({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? `More information: ${title}`}
        title="More information"
        data-info-button={title}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-400 text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <InfoIcon size={14} />
      </button>
      {open && (
        <Modal
          title={title}
          stacked
          closeX
          onClose={() => setOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setOpen(false)}>
              OK
            </Button>
          }
        >
          <div className="space-y-3 text-xl leading-relaxed text-slate-800 dark:text-slate-100">{children}</div>
        </Modal>
      )}
    </>
  );
}
