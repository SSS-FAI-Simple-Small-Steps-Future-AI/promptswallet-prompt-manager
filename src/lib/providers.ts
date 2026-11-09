// "Open in…" targets. URL formats are controlled by the providers and can change,
// so they live in this one file. The prompt is always copied to the clipboard first;
// pre-filling the chat box is a bonus where a provider supports a query parameter.

export type ProviderId = "claude" | "chatgpt" | "gemini" | "copilot";

export interface Provider {
  id: ProviderId;
  name: string;
  url: string;
  /** Query parameter that pre-fills the chat box, if the site supports one. */
  prefillParam?: string;
}

export const PROVIDERS: Provider[] = [
  { id: "claude", name: "Claude", url: "https://claude.ai/new", prefillParam: "q" },
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", prefillParam: "q" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
  { id: "copilot", name: "Microsoft Copilot", url: "https://copilot.microsoft.com/" },
];

// Browsers and servers limit URL length; longer prompts are pasted instead.
const MAX_PREFILL_URL = 6000;

export function providerById(id: ProviderId): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export function buildProviderUrl(
  provider: Provider,
  text: string,
): { url: string; prefilled: boolean } {
  if (provider.prefillParam) {
    const url = `${provider.url}?${provider.prefillParam}=${encodeURIComponent(text)}`;
    if (url.length <= MAX_PREFILL_URL) return { url, prefilled: true };
  }
  return { url: provider.url, prefilled: false };
}

/** Where a copied prompt goes: just the clipboard, or the clipboard plus a website. */
export type Destination = "clipboard" | ProviderId;
