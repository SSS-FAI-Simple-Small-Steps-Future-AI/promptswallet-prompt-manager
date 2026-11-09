import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Nav, PromptDetail, PromptSummary, PromptUpdate, Tree, UserState } from "./types";
import { api, copyText, errorMessage, openExternal } from "./lib/api";
import { useAppFont, useSidebarCollapsed, useTextSize, useTheme, useToasts } from "./lib/hooks";
import { setNvidiaKey } from "./lib/settings";
import { ABOUT } from "./lib/about";
import { sameNav } from "./lib/nav";
import { slugifyFileName } from "./lib/template";
import { buildProviderUrl, providerById, type Destination } from "./lib/providers";
import { MOD } from "./lib/platform";
import { rememberable } from "./lib/template";
import { CommandPalette } from "./components/CommandPalette";
import { CopyDialog } from "./components/CopyDialog";
import {
  AboutDialog,
  ConfirmDialog,
  DevelopersDialog,
  ImportPackDialog,
  NewCategoryDialog,
  PromptNameDialog,
} from "./components/dialogs";
import { SettingsDialog } from "./components/settingsDialogs";
import { Editor } from "./components/Editor";
import { MenuBar } from "./components/MenuBar";
import { PromptList } from "./components/PromptList";
import { PromptView } from "./components/PromptView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Kbd, Toasts } from "./components/ui";
import { SparkIcon } from "./components/icons";

type Dialog =
  | { kind: "newCategory" }
  | { kind: "developers" }
  | { kind: "importPack" }
  | { kind: "about" }
  | { kind: "settings" }
  | { kind: "removePack"; folder: string; name: string }
  | { kind: "newPrompt"; category: string; /** The category was already chosen: no dropdown. */ fixed: boolean }
  | { kind: "template"; source: PromptDetail }
  | { kind: "copy"; prompt: PromptDetail; destination: Destination }
  | { kind: "deletePrompt"; prompt: PromptDetail }
  | { kind: "deleteCategory"; name: string }
  | { kind: "discardDraft"; name: string; proceed: () => void };

/** A new prompt that has not been saved yet: nothing exists on disk until Save. */
interface NewDraft {
  category: string;
  name: string;
  /** Set when it is a copy of a pack prompt ("Use as template"). */
  source: PromptDetail | null;
}

const EMPTY_STATE: UserState = { favorites: [], recents: [], lastValues: {} };
const DEFAULT_CATEGORY = "Uncategorized";

function firstNav(tree: Tree): Nav {
  const c = tree.packs.flatMap((p) => p.categories)[0] ?? tree.mine[0];
  return c ? { kind: "category", scope: c.scope, pack: c.pack ?? null, name: c.name } : { kind: "favorites" };
}

export default function App() {
  const { toasts, push, dismiss } = useToasts();
  const theme = useTheme();
  const appFont = useAppFont();
  const sidebar = useSidebarCollapsed();
  const textSize = useTextSize();

  const [tree, setTree] = useState<Tree | null>(null);
  const [userState, setUserState] = useState<UserState>(EMPTY_STATE);
  const [workspace, setWorkspace] = useState("");
  const [nav, setNav] = useState<Nav | null>(null);
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NewDraft | null>(null);
  const [draftRev, setDraftRev] = useState(0);
  const draftDirty = useRef(false);
  const onDraftDirty = useCallback((d: boolean) => {
    draftDirty.current = d;
  }, []);
  const [editorRev, setEditorRev] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => push(errorMessage(e), "error"), [push]);

  const refresh = useCallback(async (): Promise<Tree> => {
    const [t, s] = await Promise.all([api.getTree(), api.getUserState()]);
    setTree(t);
    setUserState(s);
    return t;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await refresh();
        setWorkspace(await api.workspacePath());
        setNav((prev) => prev ?? firstNav(t));
      } catch (e) {
        setLoadError(errorMessage(e));
      }
    })();
  }, [refresh]);

  // ---------- what the middle column shows ----------

  const byId = useMemo(() => {
    const m = new Map<string, PromptSummary>();
    for (const c of [...(tree?.packs.flatMap((p) => p.categories) ?? []), ...(tree?.mine ?? [])])
      for (const p of c.prompts) m.set(p.id, p);
    return m;
  }, [tree]);

  /** The name a pack is shown under, from its folder (the key). */
  const packName = useCallback(
    (folder?: string | null) => (folder ? (tree?.packs.find((p) => p.folder === folder)?.name ?? folder) : undefined),
    [tree],
  );

  const userCategories = useMemo(() => tree?.mine.map((c) => c.name) ?? [], [tree]);

  const view = useMemo(() => {
    const n: Nav = nav ?? { kind: "favorites" };
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is PromptSummary => !!p);
    if (n.kind === "favorites")
      return {
        title: "Favorites",
        subtitle: "Prompts you have starred",
        prompts: pick(userState.favorites),
        empty: "Star a prompt and it will show up here.",
        showCategory: true,
        crumb: undefined as string | undefined,
      };
    if (n.kind === "recent")
      return {
        title: "Recent",
        subtitle: "Prompts you copied lately",
        prompts: pick(userState.recents),
        empty: "Prompts you copy will show up here.",
        showCategory: true,
        crumb: undefined as string | undefined,
      };
    const cat =
      n.scope === "builtin"
        ? tree?.packs.find((p) => p.folder === n.pack)?.categories.find((c) => c.name === n.name)
        : tree?.mine.find((c) => c.name === n.name);
    return {
      title: n.name,
      subtitle: cat?.description || (n.scope === "builtin" ? "Read-only prompts" : "Your prompts"),
      prompts: cat?.prompts ?? [],
      empty: n.scope === "user" ? "No prompts here yet. Click New to write one." : "This category is empty.",
      showCategory: false,
      crumb: n.scope === "builtin" ? packName(n.pack) : undefined,
    };
  }, [nav, tree, byId, userState, packName]);

  // ---------- actions ----------

  /**
   * Runs `proceed` once it is fine to leave the new prompt that is being written: at once when
   * there is none (or nothing was typed), otherwise after the user agrees to discard it.
   */
  const leaveDraft = useCallback(
    (proceed: () => void) => {
      if (!draft) return proceed();
      if (!draftDirty.current) {
        setDraft(null);
        return proceed();
      }
      setDialog({ kind: "discardDraft", name: draft.name, proceed });
    },
    [draft],
  );

  const select = useCallback(
    (id: string) =>
      leaveDraft(() => {
        void (async () => {
          try {
            setDetail(await api.getPrompt(id));
            setEditing(false);
          } catch (e) {
            fail(e);
          }
        })();
      }),
    [fail, leaveDraft],
  );

  const openPrompt = useCallback(
    (p: PromptSummary) =>
      leaveDraft(() => {
        setNav({ kind: "category", scope: p.scope, pack: p.pack ?? null, name: p.category });
        void (async () => {
          try {
            setDetail(await api.getPrompt(p.id));
            setEditing(false);
          } catch (e) {
            fail(e);
          }
        })();
      }),
    [fail, leaveDraft],
  );

  const finishCopy = useCallback(
    async (d: PromptDetail, text: string, values: Record<string, string>, destination: Destination) => {
      if (text.trim() === "") {
        push("This prompt is empty. Write something first.");
        return;
      }
      await copyText(text);
      let message = "Copied to clipboard";
      if (destination !== "clipboard") {
        const provider = providerById(destination);
        const { url, prefilled } = buildProviderUrl(provider, text);
        await openExternal(url);
        message = prefilled
          ? `Copied and opened ${provider.name}`
          : `Copied. Paste it into ${provider.name} (${MOD}+V)`;
      }
      push(message, "success");
      try {
        setUserState(await api.recordUse(d.id, rememberable(values)));
      } catch {
        /* remembering recents is not critical */
      }
    },
    [push],
  );

  const startCopy = useCallback(
    async (id: string, destination: Destination = "clipboard") => {
      try {
        const d = await api.getPrompt(id); // always fresh, so edits made a moment ago are included
        if (d.variables.length === 0) await finishCopy(d, d.body, {}, destination);
        else setDialog({ kind: "copy", prompt: d, destination });
      } catch (e) {
        fail(e);
      }
    },
    [finishCopy, fail],
  );

  const startTemplate = useCallback(
    async (id: string) => {
      if (userCategories.length === 0) {
        push("Create a category first, then save your copy in it.");
        setDialog({ kind: "newCategory" });
        return;
      }
      try {
        setDialog({ kind: "template", source: await api.getPrompt(id) });
      } catch (e) {
        fail(e);
      }
    },
    [fail, push, userCategories],
  );

  const defaultNewCategory = nav?.kind === "category" && nav.scope === "user" ? nav.name : DEFAULT_CATEGORY;

  /** Switching category or section empties the detail panel until a prompt is clicked. */
  const changeNav = useCallback(
    (n: Nav) => {
      if (nav && sameNav(nav, n)) return;
      leaveDraft(() => {
        setNav(n);
        setDetail(null);
        setEditing(false);
      });
    },
    [nav, leaveDraft],
  );

  /**
   * "New prompt" needs a category to save into; with none left, create one first.
   * `fixed`: opened from the New button of a category, so that category is used and no dropdown is shown.
   */
  const openNewPrompt = useCallback(
    (fixed = false) => {
      if (userCategories.length === 0) {
        push("Create a category first, then add prompts to it.");
        setDialog({ kind: "newCategory" });
        return;
      }
      leaveDraft(() => setDialog({ kind: "newPrompt", category: defaultNewCategory, fixed }));
    },
    [userCategories, defaultNewCategory, push, leaveDraft],
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      try {
        const on = await api.toggleFavorite(id);
        setUserState(await api.getUserState());
        push(on ? "Added to favorites" : "Removed from favorites");
      } catch (e) {
        fail(e);
      }
    },
    [push, fail],
  );

  /** Opens the editor for a new prompt. Nothing is written until the user presses Save. */
  function startDraft(d: NewDraft) {
    setNav({ kind: "category", scope: "user", pack: null, name: d.category });
    setDetail(null);
    setEditing(false);
    draftDirty.current = false;
    setDraft(d);
    setDraftRev((r) => r + 1);
  }

  /** Why a new prompt called `name` can't go into `category` (`null` = fine). */
  function nameProblem(name: string, category: string): string | null {
    const cat = tree?.mine.find((c) => c.name === category);
    const slug = slugifyFileName(name).replace(/\.md$/, "");
    const clash = cat?.prompts.some(
      (p) => p.fileName.toLowerCase().replace(/\.md$/, "") === slug || p.title.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    return clash ? `A prompt called “${name.trim()}” already exists in “${category}”. Choose another name.` : null;
  }

  /** Save pressed in the new-prompt editor: create the file, store the text, show it selected. */
  async function saveDraft(update: PromptUpdate) {
    if (!draft) return;
    let created: PromptDetail | null = null;
    try {
      created = draft.source
        ? await api.createFromTemplate(draft.source.id, draft.name, draft.category)
        : await api.createEmptyPrompt(draft.category, draft.name);
      const saved = await api.savePrompt(created.id, update);
      setDraft(null);
      await refresh();
      setNav({ kind: "category", scope: "user", pack: null, name: saved.category });
      setDetail(saved);
      setEditing(false);
      push(`Saved “${saved.title}”`, "success");
    } catch (e) {
      // Keep "not saved" true: do not leave a half-made file behind.
      if (created) await api.deletePrompt(created.id).catch(() => undefined);
      throw e;
    }
  }

  // ---------- keyboard shortcuts ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k" && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (dialog || paletteOpen) return;
      if (k === "n" && !e.shiftKey) {
        e.preventDefault();
        openNewPrompt(false);
      } else if (k === "c" && e.shiftKey && detail) {
        e.preventDefault();
        void startCopy(detail.id);
      } else if (k === "d" && !e.shiftKey && detail) {
        e.preventDefault();
        void startTemplate(detail.id);
      } else if (k === "b" && !e.shiftKey && detail) {
        e.preventDefault();
        void toggleFavorite(detail.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, paletteOpen, detail, openNewPrompt, startCopy, startTemplate, toggleFavorite]);

  // ---------- render ----------

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-xl font-semibold">PromptsWallet could not start</h1>
          <p className="mt-2 max-w-md text-base text-slate-600 dark:text-slate-400">{loadError}</p>
        </div>
      </div>
    );
  }

  const close = () => setDialog(null);

  return (
    <div className="flex h-full flex-col">
      <MenuBar
        onNewPrompt={() => openNewPrompt(false)}
        onNewCategory={() => setDialog({ kind: "newCategory" })}
        onImportPack={() => setDialog({ kind: "importPack" })}
        onAbout={() => setDialog({ kind: "about" })}
        onSettings={() => setDialog({ kind: "settings" })}
      />
      <TopBar onSearch={() => setPaletteOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          tree={tree}
          userState={userState}
          nav={nav ?? { kind: "favorites" }}
          collapsed={sidebar.collapsed}
          onToggleCollapsed={sidebar.toggle}
          onNav={changeNav}
          onNewCategory={() => setDialog({ kind: "newCategory" })}
          onDeleteCategory={(name) => setDialog({ kind: "deleteCategory", name })}
          onImportPack={() => setDialog({ kind: "importPack" })}
          onRemovePack={(folder, name) => setDialog({ kind: "removePack", folder, name })}
          onOpenPortal={() => void openExternal(ABOUT.portalUrl)}
          onShowDevelopers={() => setDialog({ kind: "developers" })}
          workspacePath={workspace}
          onRevealWorkspace={() => api.revealWorkspace().catch(fail)}
        />

        <PromptList
          title={view.title}
          subtitle={view.subtitle}
          crumb={view.crumb}
          prompts={view.prompts}
          selectedId={detail?.id ?? null}
          favorites={userState.favorites}
          onSelect={(id) => void select(id)}
          onNewPrompt={nav?.kind === "category" && nav.scope === "user" ? () => openNewPrompt(true) : undefined}
          emptyHint={view.empty}
          showCategory={view.showCategory}
        />

        <main className="flex min-w-0 flex-1">
          {draft ? (
            <Editor
              key={`draft:${draftRev}`}
              isNew
              detail={draftDetail(draft)}
              onSaved={() => undefined}
              onSaveNew={saveDraft}
              onCancel={() => setDraft(null)}
              onDirtyChange={onDraftDirty}
              onClose={() => setDraft(null)}
              onCopy={() => undefined}
              onDelete={() => undefined}
              onReverted={() => undefined}
              onError={(m) => push(m, "error")}
              onOpenSettings={() => setDialog({ kind: "settings" })}
              textSize={textSize}
            />
          ) : detail && editing && !detail.readOnly ? (
            <Editor
              key={`${detail.id}:${editorRev}`}
              detail={detail}
              onSaved={(d) => {
                setDetail((prev) => (prev && prev.id === d.id ? d : prev));
                void refresh();
              }}
              onClose={() => setEditing(false)}
              onCopy={() => void startCopy(detail.id)}
              onDelete={() => setDialog({ kind: "deletePrompt", prompt: detail })}
              onReverted={(d) => {
                setDetail(d);
                setEditorRev((r) => r + 1);
                void refresh();
                push("Restored the original text", "success");
              }}
              onError={(m) => push(m, "error")}
              onOpenSettings={() => setDialog({ kind: "settings" })}
              textSize={textSize}
            />
          ) : detail ? (
            <PromptView
              detail={detail}
              isFavorite={userState.favorites.includes(detail.id)}
              onCopy={(dest) => void startCopy(detail.id, dest)}
              onTemplate={() => void startTemplate(detail.id)}
              onEdit={() => {
                setEditorRev((r) => r + 1);
                setEditing(true);
              }}
              onDelete={() => setDialog({ kind: "deletePrompt", prompt: detail })}
              onToggleFavorite={() => void toggleFavorite(detail.id)}
              textSize={textSize}
              packName={packName(detail.pack)}
            />
          ) : (
            <Welcome />
          )}
        </main>
      </div>

      {paletteOpen && (
        <CommandPalette
          tree={tree}
          userState={userState}
          onClose={() => setPaletteOpen(false)}
          onCopy={(p) => {
            setPaletteOpen(false);
            void startCopy(p.id);
          }}
          onOpen={(p) => {
            setPaletteOpen(false);
            openPrompt(p);
          }}
        />
      )}

      {dialog?.kind === "importPack" && (
        <ImportPackDialog
          onOpenLink={(url) => void openExternal(url)}
          onClose={close}
          onImported={async (report, name) => {
            // An updated pack may no longer contain the prompt that is open.
            if (detail && detail.pack === report.packFolder) {
              setDetail(null);
              setEditing(false);
            }
            const t = await refresh();
            const pack = t.packs.find((p) => p.folder === report.packFolder);
            const first = pack?.categories[0];
            close();
            if (pack && first) {
              changeNav({ kind: "category", scope: "builtin", pack: pack.folder, name: first.name });
            }
            push(
              `${report.existing ? "Updated" : "Imported"} “${name}” (version ${report.version}): ${report.promptCount} prompt${report.promptCount === 1 ? "" : "s"} in ${report.categories.length} categor${report.categories.length === 1 ? "y" : "ies"}`,
              "success",
            );
          }}
        />
      )}

      {dialog?.kind === "settings" && (
        <SettingsDialog
          dark={theme.dark}
          fontSize={appFont.size}
          onSave={({ theme: mode, fontSize, nvidiaKey }) => {
            if (mode !== (theme.dark ? "dark" : "light")) theme.setChoice(mode);
            appFont.set(fontSize);
            setNvidiaKey(nvidiaKey);
            close();
            push("Settings saved", "success");
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === "about" && (
        <AboutDialog onOpenPortal={() => void openExternal(ABOUT.portalUrl)} onClose={close} />
      )}

      {dialog?.kind === "removePack" && (
        <ConfirmDialog
          title="Remove this prompts pack?"
          message={`“${dialog.name}” with all its categories and prompts will be removed from Prompts Packs and moved to the trash folder inside your workspace. You can import the pack again later.`}
          confirmLabel="Remove"
          onClose={close}
          onConfirm={async () => {
            await api.removePack(dialog.folder);
            if (detail && detail.readOnly && detail.pack === dialog.folder) {
              setDetail(null);
              setEditing(false);
            }
            const t = await refresh();
            setNav((n) =>
              n?.kind === "category" && n.scope === "builtin" && n.pack === dialog.folder ? firstNav(t) : n,
            );
            close();
            push("Prompts pack removed");
          }}
        />
      )}

      {dialog?.kind === "developers" && (
        <DevelopersDialog
          developers={ABOUT.developers}
          onOpen={(url) => void openExternal(url)}
          onClose={close}
        />
      )}

      {dialog?.kind === "newCategory" && (
        <NewCategoryDialog
          onClose={close}
          onSubmit={async (name) => {
            const created = await api.createCategory(name);
            await refresh();
            close();
            // Moving to the new category is a category switch: the detail panel starts empty.
            leaveDraft(() => {
              setNav({ kind: "category", scope: "user", pack: null, name: created });
              setDetail(null);
              setEditing(false);
            });
            push(`Created “${created}”`, "success");
          }}
        />
      )}

      {dialog?.kind === "newPrompt" && (
        <PromptNameDialog
          mode="new"
          categories={userCategories}
          defaultCategory={dialog.category}
          fixedCategory={dialog.fixed ? dialog.category : undefined}
          onClose={close}
          onSubmit={async (name, category) => {
            const problem = nameProblem(name, category);
            if (problem) throw new Error(problem);
            close();
            startDraft({ category, name: name.trim(), source: null });
          }}
        />
      )}

      {dialog?.kind === "template" && (
        <PromptNameDialog
          mode="template"
          sourceTitle={dialog.source.title}
          categories={userCategories}
          defaultCategory={defaultNewCategory}
          onClose={close}
          onSubmit={async (name, category) => {
            const problem = nameProblem(name, category);
            if (problem) throw new Error(problem);
            const source = dialog.source;
            close();
            startDraft({ category, name: name.trim(), source });
          }}
        />
      )}

      {dialog?.kind === "copy" && (
        <CopyDialog
          prompt={dialog.prompt}
          destination={dialog.destination}
          onClose={close}
          onConfirm={async (text, values, destination) => {
            await finishCopy(dialog.prompt, text, values, destination);
            close();
          }}
        />
      )}

      {dialog?.kind === "deletePrompt" && (
        <ConfirmDialog
          title="Delete this prompt?"
          message={`“${dialog.prompt.title}” will be moved to the trash folder inside your workspace. You can restore it from there.`}
          confirmLabel="Move to trash"
          onClose={close}
          onConfirm={async () => {
            await api.deletePrompt(dialog.prompt.id);
            if (detail?.id === dialog.prompt.id) {
              setDetail(null);
              setEditing(false);
            }
            await refresh();
            close();
            push("Moved to trash");
          }}
        />
      )}

      {dialog?.kind === "discardDraft" && (
        <ConfirmDialog
          title="Discard this new prompt?"
          message={`“${dialog.name}” has not been saved. If you leave now, it is discarded.`}
          confirmLabel="Discard"
          onClose={close}
          onConfirm={async () => {
            setDraft(null);
            close();
            dialog.proceed();
          }}
        />
      )}

      {dialog?.kind === "deleteCategory" && (
        <ConfirmDialog
          title="Delete this category?"
          message={`“${dialog.name}” and all prompts inside it will be moved to the trash folder inside your workspace.`}
          confirmLabel="Move to trash"
          onClose={close}
          onConfirm={async () => {
            await api.deleteCategory(dialog.name);
            if (draft && draft.category === dialog.name) setDraft(null);
            if (detail && !detail.readOnly && detail.category === dialog.name) {
              setDetail(null);
              setEditing(false);
            }
            const t = await refresh();
            setNav((n) =>
              n?.kind === "category" && n.scope === "user" && n.name === dialog.name ? firstNav(t) : n,
            );
            close();
            push("Moved to trash");
          }}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex h-full flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          <SparkIcon size={22} />
        </span>
        <h2 className="mt-4 text-2xl font-semibold">Pick a prompt</h2>
        <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
          Choose one from the list to read it, copy it, or make your own version of it.
        </p>
        <ul className="mt-5 space-y-2 text-left text-base text-slate-600 dark:text-slate-400">
          <li className="flex items-center gap-2"><Kbd>{MOD}</Kbd> <Kbd>K</Kbd> search and copy fast</li>
          <li className="flex items-center gap-2"><Kbd>{MOD}</Kbd> <Kbd>N</Kbd> write a new prompt</li>
          <li className="flex items-center gap-2"><Kbd>{MOD}</Kbd> <Kbd>D</Kbd> use as template</li>
          <li className="flex items-center gap-2"><Kbd>{MOD}</Kbd> <Kbd>B</Kbd> star a prompt</li>
        </ul>
      </div>
    </div>
  );
}

/** The editor wants a PromptDetail; a draft has no file yet, so this one is made up from the draft. */
function draftDetail(d: NewDraft): PromptDetail {
  const src = d.source;
  return {
    id: "",
    title: d.name,
    description: src?.description ?? "",
    tags: src?.tags ?? [],
    category: d.category,
    pack: null,
    scope: "user",
    readOnly: false,
    derivedFrom: src?.id ?? null,
    derivedFromTitle: src?.title ?? null,
    fileName: "",
    variableCount: src?.variables.length ?? 0,
    body: src?.body ?? "",
    variables: src?.variables ?? [],
    targetModels: src?.targetModels ?? [],
  };
}
