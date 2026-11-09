import githubLogo from "../assets/logo-github.svg";
import aicampusLogo from "../assets/logo-aicampus.svg";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage, pickPackFile } from "../lib/api";
import type { PackReport } from "../types";
import { slugifyFileName } from "../lib/template";
import { ABOUT, type Developer } from "../lib/about";
import { AlertIcon, CodeIcon, DownloadIcon, ExternalLinkIcon, FolderIcon, GlobeIcon, MailIcon, PackageIcon } from "./icons";
import { Button, Field, Modal, inputClass } from "./ui";

/** Runs an async action, tracking "busy" and showing the error text inside the dialog. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {message}
    </p>
  );
}

export function NewCategoryDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const { busy, error, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => onSubmit(name));
  };
  return (
    <Modal
      title="New category"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-category" disabled={busy || !name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <form id="new-category" onSubmit={submit}>
        <Field label="Category name" hint="A folder inside My Prompts, e.g. “Client Work”.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prompts for …"
            maxLength={80}
          />
        </Field>
        <ErrorLine message={error} />
      </form>
    </Modal>
  );
}

/** Shared by “New prompt” (empty file) and “Use as template” (copy of a prompt). */
export function PromptNameDialog({
  mode,
  sourceTitle,
  categories,
  defaultCategory,
  fixedCategory,
  onSubmit,
  onClose,
}: {
  mode: "new" | "template";
  sourceTitle?: string;
  categories: string[];
  defaultCategory: string;
  /** The category was already chosen (the New button of an open category): no dropdown, just a note. */
  fixedCategory?: string;
  onSubmit: (name: string, category: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(mode === "template" && sourceTitle ? `My ${sourceTitle}` : "");
  const [category, setCategory] = useState(
    fixedCategory ?? (categories.includes(defaultCategory) ? defaultCategory : (categories[0] ?? "")),
  );
  const { busy, error, run } = useAction();
  const slug = slugifyFileName(name);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => onSubmit(name, category));
  };

  return (
    <Modal
      title={mode === "template" ? "Create your own version" : "New prompt"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="prompt-name"
            disabled={busy || !slug || !category.trim()}
          >
            {mode === "template" ? "Create & edit" : "Create"}
          </Button>
        </>
      }
    >
      <form id="prompt-name" onSubmit={submit}>
        {mode === "template" && sourceTitle && (
          <p className="mb-3.5 rounded-lg bg-slate-100 px-3 py-2 text-base text-slate-800 dark:bg-slate-700 dark:text-slate-200">
            Based on <span className="font-medium">{sourceTitle}</span>. The original stays unchanged;
            your copy can be edited freely.
          </p>
        )}
        <Field
          label="Name"
          hint={
            slug ? (
              <>
                File: <span className="font-mono">{slug}.md</span>
              </>
            ) : (
              "Used as the title and the file name."
            )
          }
        >
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Brand voice rewriter"
            maxLength={120}
          />
        </Field>
        {fixedCategory ? (
          <p className="mb-3.5 flex items-center gap-2 text-base text-slate-800 dark:text-slate-200">
            <FolderIcon size={16} /> Saved in <span className="font-semibold">{fixedCategory}</span>
          </p>
        ) : (
          <Field label="Save in" hint="Only your own categories (My Prompts) are listed.">
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}
        <ErrorLine message={error} />
      </form>
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  stacked,
  danger = true,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  /** Red confirm button (default). Use `false` for actions that don't destroy anything. */
  danger?: boolean;
  /** Shown on top of another dialog. */
  stacked?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { busy, error, run } = useAction();
  return (
    <Modal
      title={title}
      onClose={onClose}
      stacked={stacked}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" className={danger ? "!bg-red-600 hover:!bg-red-500" : ""} disabled={busy} onClick={() => void run(onConfirm)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-base text-slate-700 dark:text-slate-300">{message}</p>
      <ErrorLine message={error} />
    </Modal>
  );
}

/** A message with one OK button. */
export function InfoDialog({
  title,
  message,
  stacked,
  onClose,
}: {
  title: string;
  message: string;
  stacked?: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      stacked={stacked}
      footer={
        <Button variant="primary" onClick={onClose}>
          OK
        </Button>
      }
    >
      <p className="text-base text-slate-700 dark:text-slate-300">{message}</p>
    </Modal>
  );
}

/** Names, e-mails and GitHub profiles of the team. The data lives in src/lib/about.ts. */
export function DevelopersDialog({
  developers,
  onOpen,
  onClose,
}: {
  developers: Developer[];
  onOpen: (url: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Developers Team"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <ul className="space-y-3">
        {developers.map((d) => (
          <li
            key={d.email}
            className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          >
            <p className="text-base font-semibold">{d.name}</p>
            <p className="text-base text-slate-700 dark:text-slate-300">{d.role}</p>
            <div className="mt-2 flex flex-col gap-1.5 text-base">
              <button
                type="button"
                onClick={() => onOpen(`mailto:${d.email}`)}
                className="flex items-center gap-2 text-left text-indigo-700 hover:underline dark:text-indigo-300"
              >
                <MailIcon size={14} /> {d.email}
              </button>
              <button
                type="button"
                onClick={() => onOpen(d.github)}
                className="flex items-center gap-2 break-all text-left text-indigo-700 hover:underline dark:text-indigo-300"
              >
                <CodeIcon size={14} /> {d.github}
              </button>
            </div>
          </li>
        ))}
        <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-base text-slate-700 dark:text-slate-300">{ABOUT.poweredByCredit.label}</p>
          <p className="text-base font-semibold">{ABOUT.poweredByCredit.name}</p>
          <button
            type="button"
            onClick={() => onOpen(ABOUT.poweredByCredit.url)}
            className="mt-2 flex items-center gap-2 break-all text-left text-base text-indigo-700 hover:underline dark:text-indigo-300"
          >
            <GlobeIcon size={14} /> {ABOUT.poweredByCredit.url}
          </button>
        </li>
      </ul>
    </Modal>
  );
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * "Import Prompts Pack": choose a .zip, see what is inside (or what is wrong), pick the name the
 * pack gets in the sidebar, then import. The checks run in Rust; this dialog only shows the
 * result. Nothing is written until Import. A pack whose id is already installed is refused when
 * the version is the same, and replaced (after a confirmation) when the version differs.
 */
export function ImportPackDialog({
  onOpenLink,
  onImported,
  onClose,
}: {
  onOpenLink: (url: string) => void;
  onImported: (report: PackReport, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [report, setReport] = useState<PackReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [name, setName] = useState("");
  /** Result of the name check, with the name it was made for (so a stale answer is never used). */
  const [nameCheck, setNameCheck] = useState<{ name: string; problem: string | null } | null>(null);
  const [showSameVersion, setShowSameVersion] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();

  const ok = report !== null && report.errors.length === 0;
  const existing = ok ? report.existing : null;
  const sameVersion = existing?.sameVersion === true;
  const updating = existing !== null && !sameVersion;

  const choose = async () => {
    setPickError(null);
    try {
      const picked = await pickPackFile();
      if (!picked) return;
      setPath(picked);
      setReport(null);
      setNameCheck(null);
      setChecking(true);
      const r = await api.inspectPack(picked);
      setReport(r);
      if (r.errors.length === 0) {
        // The title from config.json is the suggestion. When updating, keep the name the user
        // gave the installed pack, so an update does not silently rename it.
        setName(r.existing && !r.existing.sameVersion ? r.existing.name : r.title);
        if (r.existing?.sameVersion) setShowSameVersion(true);
      }
    } catch (e) {
      setPickError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  // Check the name as it is typed: is it used by another pack?
  useEffect(() => {
    if (!ok || !report) return;
    let stale = false;
    const t = setTimeout(() => {
      api
        .packNameProblem(name, report.packId)
        .then((problem) => !stale && setNameCheck({ name, problem }))
        .catch(() => !stale && setNameCheck({ name, problem: null }));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [name, ok, report]);

  // Put the cursor in the name field when a good pack was loaded, so renaming is one step away.
  useEffect(() => {
    if (ok) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [ok, report]);

  const nameChecked = nameCheck !== null && nameCheck.name === name;
  const nameProblem = nameChecked ? nameCheck.problem : null;
  const canImport = ok && !sameVersion && nameChecked && !nameProblem && !busy && !checking;

  /** Throws when the import fails; the caller decides where the message is shown. */
  const importNow = async (confirmed: boolean) => {
    if (!path || !report) return;
    await onImported(await api.importPack(path, name.trim(), confirmed), name.trim());
  };

  const startImport = () => {
    if (updating) setConfirmUpdate(true);
    else void run(() => importNow(false));
  };

  return (
    <>
      <Modal
        title="Import Prompts Pack"
        onClose={onClose}
        wide
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col items-start gap-2">
              {[
                { logo: githubLogo, url: ABOUT.basicPacksUrl, text: "Import Basic prompts pack from our Github Repo", id: "basic" },
                { logo: aicampusLogo, url: ABOUT.advancedPacksUrl, text: "Import Advanced prompts pack from AICampus", id: "advanced" },
              ].map((l) => (
                <button
                  key={l.id}
                  type="button"
                  data-testid={`packs-link-${l.id}`}
                  onClick={() => onOpenLink(l.url)}
                  className="inline-flex items-center gap-2 text-left text-base font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300"
                >
                  <img src={l.logo} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0 rounded" />
                  <span>{l.text}</span>
                  <ExternalLinkIcon size={14} className="shrink-0" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!canImport} onClick={startImport}>
                {busy ? "Importing…" : updating ? "Update" : "Import"}
              </Button>
            </div>
          </div>
        }
      >
        <p className="text-base text-slate-700 dark:text-slate-300">
          Choose a prompts pack: a <strong>.zip</strong> file (named like{" "}
          <span className="font-mono text-base">promptswallet-pack-&lt;ID&gt;.zip</span>) that holds a{" "}
          <span className="font-mono text-base">config.json</span> file, a{" "}
          <span className="font-mono text-base">categories</span> folder and a{" "}
          <span className="font-mono text-base">README.md</span> file. Each folder inside{" "}
          <span className="font-mono text-base">categories</span> is a category with its <strong>.md</strong>{" "}
          prompt files. No other file types are allowed.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <Button className="shrink-0 whitespace-nowrap" onClick={() => void choose()} disabled={checking || busy}>
            <DownloadIcon size={16} /> {path ? "Choose another .zip file…" : "Choose .zip file…"}
          </Button>
          {path && (
            <span className="min-w-0 truncate text-base text-slate-800 dark:text-slate-200" title={path}>
              {baseName(path)}
            </span>
          )}
        </div>

        {checking && <p className="mt-3 text-base text-slate-800 dark:text-slate-200">Checking the pack…</p>}

        {pickError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {pickError}
          </p>
        )}

        {report && report.errors.length > 0 && (
          <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">This pack can’t be imported:</p>
            <ul className="mt-1.5 max-h-52 list-disc space-y-1 overflow-y-auto pl-5">
              {report.errors.map((m, i) => (
                <li key={i} className="break-words">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ok && report && (
          <div className="mt-3 space-y-3">
            {existing && (
              <div
                role="status"
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-base ${
                  sameVersion
                    ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                }`}
              >
                <AlertIcon size={18} className="mt-0.5 shrink-0" />
                <span>
                  {sameVersion ? (
                    <>
                      Already imported as <strong>“{existing.name}”</strong>, version {existing.version}. There is
                      nothing to import.
                    </>
                  ) : (
                    <>
                      <strong>“{existing.name}”</strong> is already imported (version {existing.version}). This
                      file has version {report.version}: importing will update it.
                    </>
                  )}
                </span>
              </div>
            )}

            <div className="rounded-lg border border-moss-300 bg-moss-50 px-3 py-2 text-base text-moss-900 dark:border-moss-700 dark:bg-moss-950/50 dark:text-moss-100">
              <p className="flex items-center gap-2 font-semibold">
                <PackageIcon size={17} />
                <span className="break-words">{report.title}</span>
                <span className="rounded bg-moss-200/70 px-1.5 text-sm font-medium dark:bg-moss-800/60">
                  version {report.version}
                </span>
              </p>
              <p className="mt-1">
                {report.promptCount} prompt{report.promptCount === 1 ? "" : "s"} in {report.categories.length}{" "}
                categor{report.categories.length === 1 ? "y" : "ies"}:
              </p>
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {report.categories.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 break-words">
                    <FolderIcon size={15} />
                    <span className="font-medium">{c.name}</span> — {c.promptCount} prompt
                    {c.promptCount === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
              {report.ignoredFiles > 0 && (
                <p className="mt-1.5 text-base opacity-90">
                  Skipped {report.ignoredFiles} other file{report.ignoredFiles === 1 ? "" : "s"} (such as
                  .DS_Store).
                </p>
              )}
            </div>

            {!sameVersion && (
              <div>
                <label htmlFor="pack-name" className="mb-1 block text-base font-semibold text-slate-800 dark:text-slate-200">
                  Prompts pack name
                </label>
                <input
                  id="pack-name"
                  ref={nameRef}
                  dir="auto"
                  className={`${inputClass} ${nameProblem ? "!border-red-500 focus:!ring-red-500/30" : ""}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canImport) {
                      e.preventDefault();
                      startImport();
                    }
                  }}
                  aria-invalid={nameProblem ? true : undefined}
                  aria-describedby="pack-name-help"
                />
                {nameProblem ? (
                  <p id="pack-name-help" role="alert" className="mt-1 text-base text-red-700 dark:text-red-300">
                    {nameProblem}
                  </p>
                ) : (
                  <p id="pack-name-help" className="mt-1 text-base text-slate-700 dark:text-slate-300">
                    This is how the pack is named in the sidebar. It starts as the title from config.json; you can
                    change it.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <ErrorLine message={error} />
      </Modal>

      {showSameVersion && existing && (
        <InfoDialog
          stacked
          title="Already imported"
          message={`This prompts pack is already imported as “${existing.name}” (version ${existing.version}), and the file has the same version. There is nothing to import.`}
          onClose={() => setShowSameVersion(false)}
        />
      )}

      {confirmUpdate && existing && report && (
        <ConfirmDialog
          stacked
          danger={false}
          title="Update this prompts pack?"
          message={`“${existing.name}” is already imported with version ${existing.version}. This file contains version ${report.version}. If you continue, the old pack is removed (moved to the trash folder inside your workspace) and the new one is imported as “${name.trim()}”.`}
          confirmLabel="Update"
          onClose={() => setConfirmUpdate(false)}
          onConfirm={() => importNow(true)}
        />
      )}
    </>
  );
}

/** "About" in the menu bar: the app name, what it is, and who is behind it. */
export function AboutDialog({
  onOpenPortal,
  onClose,
}: {
  onOpenPortal: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`About ${ABOUT.appName}`}
      onClose={onClose}
      wide
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
          <PackageIcon size={28} />
        </span>
        <div>
          <p className="font-serif text-2xl font-semibold leading-tight">{ABOUT.appName}</p>
          <p className="text-base text-slate-700 dark:text-slate-300">Version {ABOUT.version}</p>
        </div>
      </div>
      <p className="mt-3 text-base font-medium text-slate-700 dark:text-slate-200">{ABOUT.tagline}</p>

      <h3 className="mt-5 text-lg font-semibold">About the application</h3>
      {ABOUT.aboutApp.map((t, i) => (
        <p key={i} className="mt-2 text-base leading-relaxed text-slate-700 dark:text-slate-300">
          {t}
        </p>
      ))}

      <h3 className="mt-5 text-lg font-semibold">About {ABOUT.poweredBy}</h3>
      {ABOUT.aboutCampus.map((t, i) => (
        <p key={i} className="mt-2 text-base leading-relaxed text-slate-700 dark:text-slate-300">
          {t}
        </p>
      ))}
      <button
        type="button"
        onClick={onOpenPortal}
        className="mt-3 inline-flex items-center gap-1.5 text-base font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300"
      >
        {ABOUT.portalLabel} <ExternalLinkIcon size={14} />
      </button>
      <p className="mt-0.5 break-all text-base text-slate-700 dark:text-slate-300">{ABOUT.portalUrl}</p>
      <p className="mt-4 text-base text-slate-700 dark:text-slate-300">
        © {new Date().getFullYear()} {ABOUT.copyrightHolder}. All rights reserved.
      </p>
    </Modal>
  );
}
