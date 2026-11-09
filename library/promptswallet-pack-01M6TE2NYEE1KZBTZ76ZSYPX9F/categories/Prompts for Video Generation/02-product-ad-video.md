---
id: vg-02-product-ad-video
title: "Product Ad Video"
description: "A short product ad as a shot-by-shot prompt set for an AI video tool."
tags: [video-generation, advertising]
variables:
  - name: PRODUCT
    label: "Product"
  - name: AUDIENCE
    label: "Audience"
  - name: BENEFIT
    label: "Main benefit"
    placeholder: "the one thing it does best"
  - name: STYLE
    label: "Visual style"
    placeholder: "e.g. bright, minimal, studio light"
  - name: LENGTH
    label: "Length"
    placeholder: "e.g. 15 seconds"
created: 2026-11-05
updated: 2026-11-05
---

Plan a {{LENGTH}} video ad for {{PRODUCT}}, aimed at {{AUDIENCE}}. The single message is: {{BENEFIT}}. Visual style: {{STYLE}}.

Give me:
1. A shot list of 4-6 shots, each with a duration, a one-paragraph visual prompt I can paste into a text-to-video tool, and the camera move.
2. A voice-over line for each shot (under 12 words each).
3. A closing frame with the product name and one call to action.

Keep the product's look consistent across shots (same colours, same shape, same lighting). Avoid claims that cannot be shown visually or verified.
