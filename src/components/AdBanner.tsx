import { useEffect, useState } from "react";
import { api, openExternal } from "../lib/api";
import { ABOUT } from "../lib/about";
import type { AdResponse } from "../types";
import { ArrowRightIcon } from "./icons";

type Ad = NonNullable<AdResponse["data"]>;
export type AdProvider = keyof typeof ABOUT.ads;

const MIN_SECONDS = 15;
const MAX_SECONDS = 3600;

/** Brand look of each banner. Square corners; the colours are fixed (they do not follow dark mode). */
const THEMES: Record<
  AdProvider,
  { bg: string; text: string; sub: string; chip: string; show: string }
> = {
  // NVIDIA: green background, white text, NVIDIA-green call to action.
  nvidia: {
    bg: "linear-gradient(135deg, #4d8400 0%, #2f5a05 100%)",
    text: "#ffffff",
    sub: "rgba(255,255,255,0.86)",
    chip: "background:#76b900;color:#10200a",
    show: "min-[820px]:flex",
  },
  // Claude: Anthropic clay background, dark text.
  claude: {
    bg: "linear-gradient(135deg, #e08a69 0%, #d4714f 100%)",
    text: "#2a1710",
    sub: "rgba(42,23,16,0.82)",
    chip: "background:#2a1710;color:#faf3ec",
    show: "min-[1000px]:flex",
  },
  // Any other provider: light blue background, dark grey text.
  generic: {
    bg: "linear-gradient(135deg, #e3f0fc 0%, #cfe3f6 100%)",
    text: "#2d3640",
    sub: "rgba(45,54,64,0.82)",
    chip: "background:#2d3640;color:#ffffff",
    show: "min-[1200px]:flex",
  },
};

/** An ad is shown only when the service says it is active and there is something to show. */
function usable(r: AdResponse): Ad | null {
  const d = r.data;
  // `success` and `status` are optional: an ad is hidden only when they say so explicitly.
  if (r.success === false || !d || (d.status && d.status !== "active")) return null;
  if (!d.banner?.image_data_url && !d.title) return null;
  return d;
}

/** Only web addresses are opened from an ad; anything else (file:, javascript:...) is ignored. */
function safeUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function chipStyle(css: string): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const part of css.split(";")) {
    const [k, v] = part.split(":");
    if (k && v) o[k.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v.trim();
  }
  return o;
}

/**
 * One sponsored banner. It asks its own ad service for an ad when the app opens and again every
 * minute (or the `refresh_interval` of the last answer). If a refresh fails the last ad stays;
 * before the first ad arrives a quiet placeholder keeps the space. A click opens the ad's
 * `target_url` in the system browser. The banner's width follows the window; its picture
 * appears only when the banner is wide enough for it.
 */
export function AdSlot({ provider }: { provider: AdProvider }) {
  const theme = THEMES[provider];
  const cfg = ABOUT.ads[provider];
  const { label, apiUrl } = cfg;
  // The fixed banner; a live ad from the optional ad service replaces it.
  const fixed: Ad = {
    ad_id: `fixed-${provider}`,
    advertiser: label,
    title: cfg.title,
    description: cfg.subtitle,
    target_url: cfg.url,
    status: "active",
  } as Ad;
  const [ad, setAd] = useState<Ad | null>(fixed);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    if (!apiUrl) return;
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      let seconds = ABOUT.adRefreshSeconds;
      try {
        const r = await api.fetchAd(apiUrl);
        if (stopped) return;
        setAd(usable(r) ?? fixed);
        setImageBroken(false);
        if (typeof r.refresh_interval === "number" && r.refresh_interval >= MIN_SECONDS) {
          seconds = Math.min(r.refresh_interval, MAX_SECONDS);
        }
      } catch {
        /* offline or the service is down: keep what is shown and try again later */
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), seconds * 1000);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  const shell = `@container relative hidden h-[5.75rem] min-w-0 flex-1 basis-0 items-stretch overflow-hidden text-left ${theme.show}`;

  if (!ad) {
    return (
      <div
        data-testid={`ad-${provider}-placeholder`}
        data-provider={provider}
        aria-label={`${label} advertisement space`}
        style={{ background: theme.bg, color: theme.text }}
        className={`${shell} flex-col justify-center gap-0.5 px-3.5`}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{label}</span>
        <span className="text-sm font-semibold opacity-90">Sponsored space</span>
      </div>
    );
  }

  const url = safeUrl(ad.target_url);
  const banner = ad.banner;
  const showImage = !!banner?.image_data_url && !imageBroken;
  const title = ad.title || ad.advertiser || label;
  const a11y = `Advertisement from ${ad.advertiser || label}: ${title}`;

  return (
    <button
      type="button"
      data-testid={`ad-${provider}`}
      data-provider={provider}
      data-ad-id={ad.ad_id}
      disabled={!url}
      onClick={() => url && void openExternal(url)}
      title={[ad.title, ad.description].filter(Boolean).join(" – ") || undefined}
      aria-label={url ? `${a11y}. Opens in your browser.` : a11y}
      style={{ background: theme.bg, color: theme.text }}
      className={`${shell} group shadow-sm transition-[filter,box-shadow] hover:shadow-md hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-default dark:focus-visible:ring-offset-slate-900`}
    >
      <span className="flex min-w-0 flex-1 flex-col justify-between gap-1 px-3.5 py-2">
        <span className="min-w-0">
          <span className="line-clamp-2 block text-sm font-semibold leading-[1.15]">{title}</span>
          {ad.description && (
            <span className="mt-0.5 block truncate text-xs" style={{ color: theme.sub }}>
              {ad.description}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          {url ? (
            <span
              className="inline-flex w-fit items-center gap-1 px-2 py-0.5 text-[11px] font-semibold leading-4"
              style={chipStyle(theme.chip)}
            >
              Learn more <ArrowRightIcon size={11} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          ) : (
            <span />
          )}
          <span
            className="shrink-0 rounded-sm px-1 text-[9px] font-semibold uppercase leading-[14px] tracking-wide"
            style={{ border: `1px solid ${theme.sub}`, color: theme.sub }}
          >
            Ad
          </span>
        </span>
      </span>
      {showImage && (
        <span className="hidden w-[36%] shrink-0 items-center justify-center p-2 @[15rem]:flex">
          <img
            src={banner?.image_data_url}
            alt={banner?.alt_text || title}
            draggable={false}
            onError={() => setImageBroken(true)}
            className="max-h-full max-w-full object-contain"
          />
        </span>
      )}
    </button>
  );
}
