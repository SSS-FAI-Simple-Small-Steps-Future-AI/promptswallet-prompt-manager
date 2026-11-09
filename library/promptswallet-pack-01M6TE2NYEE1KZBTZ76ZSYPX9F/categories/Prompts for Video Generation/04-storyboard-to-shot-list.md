---
id: vg-04-storyboard-to-shot-list
title: "Storyboard to Shot List"
description: "Turn a short story or script into numbered shots with framing and timing."
tags: [video-generation, planning]
variables:
  - name: STORY
    label: "Story or script"
    placeholder: "paste your script or a short summary"
  - name: TOTAL_LENGTH
    label: "Total length"
    placeholder: "e.g. 60 seconds"
  - name: STYLE
    label: "Visual style"
    placeholder: "e.g. documentary, handheld, natural light"
created: 2026-11-05
updated: 2026-11-05
---

Turn this into a shot list for a {{TOTAL_LENGTH}} video in a {{STYLE}} style:

{{STORY}}

Return a table with these columns: shot number, duration, framing (wide / medium / close-up), camera movement, what happens, and a text-to-video prompt for the shot. Durations must add up to the total length. End with a short list of anything in the story that is hard to show visually and how you handled it.
