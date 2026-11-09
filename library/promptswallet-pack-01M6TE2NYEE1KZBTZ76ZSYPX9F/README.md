# Content Creator Starter Pack

The starter pack that comes with PromptsWallet: 51 prompts for content creators and 5 for video generation.

## How to import a prompts pack like this one

1. Download a pack. It is a `.zip` file named `promptswallet-pack-<ULID>.zip`.
2. In PromptsWallet, open **Prompts Packs** in the left panel and click **Import Prompts Pack**.
3. Choose the `.zip` file. The app checks it and shows what is inside.
4. Change the pack name if you like (it starts as the `title` from `config.json`). The name must not be used by another pack.
5. Click **Import**. The pack appears under **Prompts Packs**, with each category folder and its prompts.

If the pack was imported before, the app tells you which version you have. A newer version asks you to confirm the update, which replaces the old copy.

## What is inside a pack

```
promptswallet-pack-<ULID>/
├── config.json      {"prompt-pack-id": "<ULID>", "title": "...", "version": "1.0"}
├── README.md        this file
└── categories/
    └── <Category name>/
        └── <prompt>.md
```

Only `.md` files are allowed inside the category folders.
