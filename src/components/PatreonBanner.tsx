import { openExternal } from "../lib/api";
import { ABOUT } from "../lib/about";
import { ArrowRightIcon, HeartIcon } from "./icons";

/** Fixed banner that asks for support on Patreon. A click opens the Patreon page in the browser. */
export function PatreonBanner() {
  return (
    <button
      type="button"
      data-testid="patreon-banner"
      onClick={() => void openExternal(ABOUT.patreonUrl)}
      title="Support PromptsWallet on Patreon"
      aria-label="Support this project on Patreon. Opens in your browser."
      className="@container group relative hidden h-[5.75rem] min-w-0 flex-1 basis-0 items-stretch overflow-hidden bg-[#FF424D] text-left text-white shadow-sm transition-[filter,box-shadow] hover:shadow-md hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 min-[820px]:flex dark:focus-visible:ring-offset-slate-900"
    >
      <span className="flex min-w-0 flex-1 flex-col justify-between gap-1 px-3.5 py-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-[1.15]">Support this project</span>
          <span className="mt-0.5 block truncate text-xs text-white/90">Help keep PromptsWallet free</span>
        </span>
        <span className="inline-flex w-fit items-center gap-1 bg-white px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#d92f3a]">
          Become a patron <ArrowRightIcon size={11} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
      <span className="hidden w-[30%] shrink-0 items-center justify-center @[13rem]:flex">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
          <HeartIcon size={22} />
        </span>
      </span>
    </button>
  );
}
