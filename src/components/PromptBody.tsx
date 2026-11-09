import { splitPlaceholders } from "../lib/template";

/** Prompt text size (px at the design size) that follows the app font size from Settings. */
export const scaledPx = (px: number) => `calc(${px}px * var(--pw-scale, 1))`;

/** Prompt text with {{VARIABLES}} highlighted. Shown as plain text so what you see is what gets copied. */
export function PromptBody({
  text,
  tone = "indigo",
  className = "",
  fontSize,
}: {
  text: string;
  tone?: "indigo" | "amber";
  className?: string;
  /** Size in px. Defaults to the size of the surrounding text. */
  fontSize?: number;
}) {
  const mark =
    tone === "amber"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200";
  return (
    <div
      dir="auto"
      style={fontSize ? { fontSize: scaledPx(fontSize) } : undefined}
      className={`whitespace-pre-wrap break-words font-serif leading-relaxed ${className}`}
    >
      {splitPlaceholders(text).map((p, i) =>
        p.isVar ? (
          <mark key={i} className={`rounded px-1 ${mark}`}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </div>
  );
}
