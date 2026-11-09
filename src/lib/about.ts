// Branding, links and developer info shown in the app. Edit this one file.
//
// !! The URLs, names, e-mails, GitHub links and the AI Campus text below are PLACEHOLDERS. Replace them
// !! with the real ones before you ship.

export interface Developer {
  name: string;
  role: string;
  email: string;
  /** Full profile URL, e.g. https://github.com/your-username */
  github: string;
}

export const ABOUT = {
  /** Name shown in the title bar, the top bar and the About dialog. */
  appName: "PromptsWallet",
  version: "1.0.0",
  /** One-line description under the name in the About dialog. */
  tagline: "Your prompts, in one place, ready for any AI.",
  /** The text of the About dialog about the application. Edit freely. */
  aboutApp: [
    "PromptsWallet keeps all your prompts in one place on your own computer. Browse ready-made prompts, fill in the blanks, and copy a prompt into any AI chat or tool with one click.",
    "Prompts come in Prompts Packs: folders of categories, each holding prompt files. The packs are read-only, so the originals always stay as published. Use a prompt as a template to make your own editable copy, or write new prompts in My Prompts.",
    "Everything is stored as plain Markdown files in a folder you can open, back up or sync. Nothing is sent anywhere.",
  ],
  /** The text of the About dialog about AI Campus. Replace with your own wording. */
  aboutCampus: [
    "PromptsWallet is built and maintained by AICampus, a team that creates learning resources and tools to help people use AI well.",
    "New Prompts Packs are published through the AICampus portal and can be imported into the app at any time from the Prompts Packs section.",
  ],
  /** "Powered By …" line in the left panel footer. */
  poweredBy: "AICampus",
  /** Link under it. */
  portalLabel: "AI Campus Portal",
  portalUrl: "https://aicampusmagazines.gumroad.com/",

  /** Link in the footer of the "Import Prompts Pack" dialog: your Gumroad download page.
   *  (Opens in the system browser.) */
  /** Import dialog links. PLACEHOLDER for the GitHub repo that holds the basic prompts packs. */
  basicPacksUrl: "https://github.com/SSS-FAI-Simple-Small-Steps-Future-AI/promptswallet-prompt-manager",
  advancedPacksUrl: "https://aicampusmagazines.gumroad.com/l/ttwwkw",

  /**
   * "Rewrite with AI" uses NVIDIA's free hosted models (OpenAI-compatible chat completions).
   * The API key is not stored here: each user pastes their own in Settings > AI rewrite
   * (get one at `nvidiaKeysUrl`),.
   * The models offered in the rewrite dialog are listed in `NVIDIA_MODELS` (src/lib/settings.ts).
   */
  nvidiaApiUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
  nvidiaKeysUrl: "https://build.nvidia.com/settings/api-keys",
  /** Page that lists NVIDIA's free hosted models (shown as a link in Settings > AI rewrite). */
  nvidiaModelsUrl: "https://build.nvidia.com/models",

  /** Static "support this project" banner left of the ad. PLACEHOLDER: use your own Patreon page. */
  patreonUrl: "https://www.patreon.com/collection/2483538",

  /**
   * The three banners right of the search bar show the title and link below (fixed text). Optional:
   * give a banner an `apiUrl` and it also asks that ad service (GET, https://) every
   * `adRefreshSeconds` (or the answer's `refresh_interval`); a successful, active ad then replaces
   * the fixed text and the picture comes from `data.banner.image_url`. A failed call keeps what is
   * shown. Leave `apiUrl` empty for no network calls.
   */
  ads: {
    nvidia: {
      label: "NVIDIA",
      title: "Free Courses & Learning By Nvidia",
      subtitle: "Free training from NVIDIA",
      url: "https://www.nvidia.com/en-us/training/find-training/?Free+Courses=Free",
      apiUrl: "",
    },
    claude: {
      label: "Claude",
      title: "Claude Academy For Learning",
      subtitle: "Effective prompting techniques",
      url: "https://academy.claude.com/courses/ai-fluency-framework-foundations/effective-prompting-techniques",
      apiUrl: "",
    },
    generic: {
      label: "Sponsored",
      title: "Prompt Engineering For Everyone",
      subtitle: "Find courses on Coursera",
      url: "https://www.coursera.org/search?query=prompt%20engineering",
      apiUrl: "",
    },
  },
  adRefreshSeconds: 60,

  /** Shown as "© <year> <holder>. All rights reserved." */
  copyrightHolder: "AICampus",

  /** Shown by the "Developers Team" button. Add or remove entries freely. */
  developers: [
    {
      name: "Furqan",
      role: "Lead Developer | Senior AI Engineer",
      email: "furqan.cloud.dev@gmail.com",
      github: "https://github.com/furqan-cloud-dev",
    },
  ] as Developer[],
  /** The "Powered By" card under the developers in the "Developers Team" dialog. */
  poweredByCredit: {
    label: "Powered By",
    name: "AICampus | SSS-FAI Org. (Small-Simple-Steps Towards Future AI)",
    url: "https://aicampusmagazines.gumroad.com/",
  },
};
