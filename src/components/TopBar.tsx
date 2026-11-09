import { ABOUT } from "../lib/about";
import { IS_MAC } from "../lib/platform";
import { AdSlot } from "./AdBanner";
import { PatreonBanner } from "./PatreonBanner";
import { Kbd } from "./ui";
import { SearchIcon, SparkIcon } from "./icons";

/**
 * Brand, search and the four banners (the menu bar is a separate row above this). The banners
 * share the free width equally: Patreon (fixed link), NVIDIA, Claude and a generic slot. Narrow
 * windows drop the last ones first.
 */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="flex h-[7rem] shrink-0 items-center gap-5 border-b border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <SparkIcon size={19} />
        </span>
        <span className="font-serif text-xl font-semibold tracking-tight">{ABOUT.appName}</span>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="flex min-w-[10rem] flex-[0_1_17rem] items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-left text-base text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500"
      >
        <SearchIcon size={17} />
        <span className="flex-1 truncate">Search prompts…</span>
        <Kbd>{IS_MAC ? "⌘ K" : "Ctrl K"}</Kbd>
      </button>
      <div className="flex min-w-0 flex-1 items-stretch gap-2" data-testid="banner-row">
        <PatreonBanner />
        <AdSlot provider="nvidia" />
        <AdSlot provider="claude" />
        <AdSlot provider="generic" />
      </div>
    </header>
  );
}
