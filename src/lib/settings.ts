/** Small per-user settings kept in the window's local storage (never in the prompt files). */

/** LLMs the rewrite can be tuned for. The first is the default. */
export const TARGET_LLMS = [
  "Claude",
  "ChatGPT",
  "Gemini",
  "Microsoft Copilot",
  "Grok",
  "Llama",
  "Mistral",
  "DeepSeek",
  "Any LLM (general)",
] as const;

/**
 * The NVIDIA models "Rewrite with AI" can call, in the order of the dropdown. All of them are
 * served from NVIDIA's free endpoints. The first is the default.
 */
export const NVIDIA_MODELS = [
  { id: "nvidia/nemotron-3.5-bolt-e4b", label: "Nemotron 3.5 Bolt E4B", role: "Fast, simple rewriting" },
  { id: "mistralai/mistral-large-4-1t-a52b", label: "Mistral Large 4", role: "Complex prompt rewriting" },
  { id: "deepseek-ai/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", role: "Technical prompt optimization" },
  { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning", role: "Quality and speed" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS-20B", role: "Lightweight optimization" },
] as const;
export const DEFAULT_NVIDIA_MODEL: string = NVIDIA_MODELS[0].id;

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable: the value just is not remembered */
  }
}

/** The NVIDIA API key the user pasted in Settings ("" = none; the environment variable is used then). */
export const getNvidiaKey = () => read("pw-nvidia-key");
export const setNvidiaKey = (key: string) => write("pw-nvidia-key", key.trim());

export function getTargetLlm(): string {
  const saved = read("pw-target-llm");
  return (TARGET_LLMS as readonly string[]).includes(saved) ? saved : TARGET_LLMS[0];
}
export const setTargetLlm = (llm: string) => write("pw-target-llm", llm);
