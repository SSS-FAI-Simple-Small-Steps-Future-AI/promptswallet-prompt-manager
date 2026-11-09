---
id: vg-01-cinematic-shot-prompt
title: "Cinematic Shot Prompt"
description: "One detailed text-to-video prompt: subject, camera, lighting and mood."
tags: [video-generation, text-to-video]
variables:
  - name: SUBJECT
    label: "Subject"
    placeholder: "e.g. an elderly fisherman mending a net"
  - name: SETTING
    label: "Setting"
    placeholder: "e.g. a foggy harbour at dawn"
  - name: CAMERA
    label: "Camera move"
    placeholder: "e.g. slow dolly-in, 35mm lens"
  - name: MOOD
    label: "Mood"
    placeholder: "e.g. quiet, nostalgic"
  - name: DURATION
    label: "Duration"
    placeholder: "e.g. 8 seconds"
created: 2026-11-05
updated: 2026-11-05
---

Write one text-to-video prompt for a {{DURATION}} clip.

Subject: {{SUBJECT}}
Setting: {{SETTING}}
Camera: {{CAMERA}}
Mood: {{MOOD}}

Describe, in this order and in plain language: the subject and what they do over time, the environment, the camera movement and lens, the lighting and colour palette, and the sound or ambience. Use concrete visual detail instead of abstract adjectives. Keep it under 120 words and make it a single continuous shot. Do not include text overlays or on-screen words.
