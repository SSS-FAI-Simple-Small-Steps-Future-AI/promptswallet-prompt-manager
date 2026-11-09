import { useEffect, useState, type ReactNode } from "react";
import type { Nav, Tree, UserState } from "../types";
import { ABOUT } from "../lib/about";
import { sameNav } from "../lib/nav";
import {
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  UsersIcon,
} from "./icons";

/** "Content Creator" -> "CC". Used as the icon of a category when the panel is collapsed. */
function initials(name: string): string {
  const words = name.replace(/^Prompts for\s+/i, "").split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}

function Row({
  active,
  collapsed,
  onClick,
  icon,
  collapsedIcon,
  label,
  count,
  action,
  nested = false,
}: {
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  icon: ReactNode;
  collapsedIcon?: ReactNode;
  label: string;
  count?: number;
  action?: ReactNode;
  /** A category inside a pack (indented). */
  nested?: boolean;
}) {
  const tone = active
    ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200"
    : "text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={count === undefined ? label : `${label} (${count})`}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`mx-auto my-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tone}`}
      >
        {collapsedIcon ?? icon}
      </button>
    );
  }

  return (
    <div className={`group flex items-start rounded-lg ${nested ? "ml-3" : ""} ${tone}`}>
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="mt-0.5 shrink-0 opacity-80">{icon}</span>
        {/* Long names wrap instead of being cut off. */}
        <span className="min-w-0 flex-1 break-words leading-snug">{label}</span>
        {count !== undefined && (
          <span className="mt-0.5 shrink-0 text-sm tabular-nums text-slate-500">{count}</span>
        )}
      </button>
      {action}
    </div>
  );
}

type Tone = "pack" | "mine";

const BAND: Record<Tone, string> = {
  pack: "border-indigo-600 bg-indigo-100 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950/70 dark:text-indigo-100",
  mine: "border-moss-600 bg-moss-100 text-moss-900 dark:border-moss-400 dark:bg-moss-950/80 dark:text-moss-100",
};
const BAR: Record<Tone, string> = { pack: "bg-indigo-500", mine: "bg-moss-500" };

/** Big, bold, coloured heading that opens "Prompts Packs" or "My Prompts". */
function SectionTitle({
  tone,
  collapsed,
  children,
  action,
}: {
  tone: Tone;
  collapsed: boolean;
  children: ReactNode;
  action?: ReactNode;
}) {
  if (collapsed) {
    return <div className={`mx-2 my-3 h-1 rounded-full ${BAR[tone]}`} />;
  }
  return (
    <div className="mb-2 mt-5 border-t-2 border-slate-300 pt-4 dark:border-slate-700">
      <div className={`flex items-center justify-between rounded-lg border-l-[5px] px-3 py-2.5 ${BAND[tone]}`}>
        <h2 className="flex items-center gap-2 font-sans text-lg font-extrabold uppercase tracking-wide">{children}</h2>
        {action}
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {children}
    </button>
  );
}

export function Sidebar({
  tree,
  userState,
  nav,
  collapsed,
  onToggleCollapsed,
  onNav,
  onNewCategory,
  onDeleteCategory,
  onImportPack,
  onRemovePack,
  onOpenPortal,
  onShowDevelopers,
  workspacePath,
  onRevealWorkspace,
}: {
  tree: Tree | null;
  userState: UserState;
  nav: Nav;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNav: (n: Nav) => void;
  onNewCategory: () => void;
  onDeleteCategory: (name: string) => void;
  onImportPack: () => void;
  /** `folder` is the key of the pack, `name` what the user sees. */
  onRemovePack: (folder: string, name: string) => void;
  onOpenPortal: () => void;
  onShowDevelopers: () => void;
  workspacePath: string;
  onRevealWorkspace: () => void;
}) {
  const year = new Date().getFullYear();
  const [closedPacks, setClosedPacks] = useState<Set<string>>(new Set());
  const togglePack = (name: string) =>
    setClosedPacks((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  // Selecting something inside a pack (e.g. from search) opens that pack.
  const selectedPack = nav.kind === "category" ? nav.pack : null;
  useEffect(() => {
    if (!selectedPack) return;
    setClosedPacks((prev) => {
      if (!prev.has(selectedPack)) return prev;
      const next = new Set(prev);
      next.delete(selectedPack);
      return next;
    });
  }, [selectedPack]);

  return (
    <nav
      aria-label="Prompts Packs and My Prompts"
      className={`flex h-full shrink-0 flex-col border-r border-slate-200 bg-slate-100 transition-[width] duration-150 dark:border-slate-800 dark:bg-slate-950 ${
        collapsed ? "w-16" : "w-72"
      }`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 pt-2">
        <div className={`mb-1 flex ${collapsed ? "justify-center" : "justify-end"}`}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? "Expand panel" : "Collapse panel"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {collapsed ? <ChevronsRightIcon size={18} /> : <ChevronsLeftIcon size={18} />}
          </button>
        </div>

        <Row
          active={sameNav(nav, { kind: "favorites" })}
          collapsed={collapsed}
          onClick={() => onNav({ kind: "favorites" })}
          icon={<StarIcon size={15} />}
          label="Favorites"
          count={userState.favorites.length}
        />
        <Row
          active={sameNav(nav, { kind: "recent" })}
          collapsed={collapsed}
          onClick={() => onNav({ kind: "recent" })}
          icon={<ClockIcon size={15} />}
          label="Recent"
          count={userState.recents.length}
        />

        <SectionTitle tone="pack" collapsed={collapsed}>
          <PackageIcon size={18} /> Prompts Packs
        </SectionTitle>
        {collapsed ? (
          <IconButton title="Import Prompts Pack" onClick={onImportPack}>
            <DownloadIcon size={18} />
          </IconButton>
        ) : (
          <button
            type="button"
            onClick={onImportPack}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-400 bg-white px-3 py-2 text-base font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-indigo-500 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
          >
            <DownloadIcon size={17} /> Import Prompts Pack
          </button>
        )}
        {tree?.packs.map((pack) => {
          const open = !closedPacks.has(pack.folder);
          const total = pack.categories.reduce((n, c) => n + c.prompts.length, 0);
          const remove = !pack.builtin ? (
            <button
              type="button"
              onClick={() => onRemovePack(pack.folder, pack.name)}
              title="Remove this prompts pack"
              aria-label={`Remove prompts pack ${pack.name}`}
              className="mr-1 mt-1.5 rounded p-1 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-700"
            >
              <TrashIcon size={14} />
            </button>
          ) : undefined;
          return (
            <div key={pack.folder} className="mb-1" role="group" aria-label={pack.name}>
              {!collapsed && (
                <div className="group flex items-start rounded-lg text-slate-800 hover:bg-slate-200/60 dark:text-slate-100 dark:hover:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => togglePack(pack.folder)}
                    aria-expanded={open}
                    title={pack.version ? `${pack.name} (version ${pack.version})` : pack.name}
                    className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left text-base font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <span className={`mt-1 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}>
                      <ChevronRightIcon size={15} />
                    </span>
                    <span className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-300">
                      <PackageIcon size={17} />
                    </span>
                    <span className="min-w-0 flex-1 break-words leading-snug">
                      {pack.name}
                      {pack.version && (
                        <span className="block text-sm font-normal text-slate-500">version {pack.version}</span>
                      )}
                    </span>
                    <span className="mt-0.5 shrink-0 text-sm font-normal tabular-nums text-slate-500">{total}</span>
                  </button>
                  {remove}
                </div>
              )}
              {(open || collapsed) && (
                <div className={collapsed ? "" : "ml-3 border-l border-slate-300 pl-1 dark:border-slate-700"}>
                  {pack.categories.map((c) => {
                    const target: Nav = { kind: "category", scope: "builtin", pack: pack.folder, name: c.name };
                    return (
                      <Row
                        key={`${pack.folder}/${c.name}`}
                        nested={false}
                        active={sameNav(nav, target)}
                        collapsed={collapsed}
                        onClick={() => onNav(target)}
                        icon={<FolderIcon size={16} />}
                        collapsedIcon={initials(c.name)}
                        label={c.name}
                        count={c.prompts.length}
                      />
                    );
                  })}
                  {pack.categories.length === 0 && !collapsed && (
                    <p className="px-2.5 py-1 text-sm text-slate-500">No categories.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {tree && tree.packs.length === 0 && !collapsed && (
          <p className="px-2.5 py-1 text-sm text-slate-500">No prompts packs yet. Import one above.</p>
        )}

        <SectionTitle
          tone="mine"
          collapsed={collapsed}
          action={
            <button
              type="button"
              onClick={onNewCategory}
              title="New category"
              aria-label="New category"
              className="rounded p-1 text-moss-800 hover:bg-moss-200/70 dark:text-moss-200 dark:hover:bg-moss-900"
            >
              <PlusIcon size={17} />
            </button>
          }
        >
          <PencilIcon size={17} /> My Prompts
        </SectionTitle>
        {tree?.mine.map((c) => (
          <Row
            key={`u-${c.name}`}
            active={sameNav(nav, { kind: "category", scope: "user", name: c.name })}
            collapsed={collapsed}
            onClick={() => onNav({ kind: "category", scope: "user", name: c.name })}
            icon={<FolderIcon size={15} />}
            collapsedIcon={initials(c.name)}
            label={c.name}
            count={c.prompts.length}
            action={
              <button
                type="button"
                onClick={() => onDeleteCategory(c.name)}
                title="Move category to trash"
                aria-label={`Move ${c.name} to trash`}
                className="mr-1 mt-1 rounded p-1 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-700"
              >
                <TrashIcon size={13} />
              </button>
            }
          />
        ))}
        {collapsed ? (
          <IconButton title="New category" onClick={onNewCategory}>
            <PlusIcon size={16} />
          </IconButton>
        ) : (
          <button
            type="button"
            onClick={onNewCategory}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-base text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <PlusIcon size={14} /> New category
          </button>
        )}
      </div>

      {collapsed ? (
        <div className="flex flex-col gap-0.5 border-t border-slate-200 py-2 dark:border-slate-800">
          <IconButton title={`Open workspace folder\n${workspacePath}`} onClick={onRevealWorkspace}>
            <FolderIcon size={16} />
          </IconButton>
          <IconButton title="Developers Team" onClick={onShowDevelopers}>
            <UsersIcon size={16} />
          </IconButton>
        </div>
      ) : (
        <div className="border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onRevealWorkspace}
            title={`Open workspace folder\n${workspacePath}`}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <FolderIcon size={13} />
            <span className="truncate">Open my prompts folder</span>
          </button>
          <div className="space-y-1.5 border-t border-slate-200 px-4 py-3 text-sm leading-snug text-slate-500 dark:border-slate-800">
            <p>
              Powered By <span className="font-semibold text-slate-700 dark:text-slate-200">{ABOUT.poweredBy}</span>
            </p>
            <button
              type="button"
              onClick={onOpenPortal}
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-400"
            >
              {ABOUT.portalLabel} <ExternalLinkIcon size={10} />
            </button>
            <p>
              © {year} {ABOUT.copyrightHolder}. All rights reserved.
            </p>
            <button
              type="button"
              onClick={onShowDevelopers}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <UsersIcon size={13} /> Developers Team
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
