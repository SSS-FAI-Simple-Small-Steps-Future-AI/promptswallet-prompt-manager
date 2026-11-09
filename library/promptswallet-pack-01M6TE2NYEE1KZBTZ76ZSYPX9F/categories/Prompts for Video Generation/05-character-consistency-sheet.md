---
id: vg-05-character-consistency-sheet
title: "Character Consistency Sheet"
description: "A reusable character description to paste into every shot prompt."
tags: [video-generation, consistency]
variables:
  - name: CHARACTER
    label: "Character"
    placeholder: "e.g. a 30-year-old courier named Sam"
  - name: STORY_CONTEXT
    label: "Story context"
    placeholder: "where and when the story takes place"
created: 2026-11-05
updated: 2026-11-05
---

Create a character sheet for {{CHARACTER}} in this story: {{STORY_CONTEXT}}

Write a fixed description block of 40-60 words that covers age, face shape, hair, skin tone, build, clothing (with colours), and one distinctive detail. Use exactly the same wording every time so I can paste it at the start of each shot prompt. Then add:
- three alternative outfits in the same format,
- five expression and pose descriptions (neutral, happy, worried, determined, surprised),
- a list of things to avoid that tend to make AI video characters change between shots.
