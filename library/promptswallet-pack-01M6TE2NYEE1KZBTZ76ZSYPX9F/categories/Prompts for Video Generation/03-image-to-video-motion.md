---
id: vg-03-image-to-video-motion
title: "Image-to-Video Motion Prompt"
description: "Describe how a still image should move, without changing what is in it."
tags: [video-generation, image-to-video]
variables:
  - name: IMAGE_DESCRIPTION
    label: "What the image shows"
  - name: MOTION
    label: "Motion you want"
    placeholder: "e.g. hair and leaves moving in a light breeze"
  - name: CAMERA
    label: "Camera"
    placeholder: "e.g. slow push-in, then hold"
  - name: DURATION
    label: "Duration"
    placeholder: "e.g. 5 seconds"
created: 2026-11-05
updated: 2026-11-05
---

I have a still image: {{IMAGE_DESCRIPTION}}

Write an image-to-video motion prompt for a {{DURATION}} clip. Motion: {{MOTION}}. Camera: {{CAMERA}}.

Rules for the prompt:
- Describe only movement, not what is already in the image.
- Keep the subject's face, clothing, colours and the background layout unchanged.
- Name what should stay still, so it does not drift.
- Keep the movement subtle and physically plausible.
- Under 60 words.

Then give two alternative versions: one with more movement, one with less.
