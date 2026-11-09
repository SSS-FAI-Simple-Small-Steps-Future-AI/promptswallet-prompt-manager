#!/usr/bin/env python3
"""Convert scripts/source/content-creator-prompts.md into built-in prompt files.

    python3 scripts/build_library.py

Output: library/promptswallet-pack-01M6TE2NYEE1KZBTZ76ZSYPX9F/categories/Prompts for Content Creator/NN-slug.md  (one file per prompt)

Each [BRACKETED PLACEHOLDER] inside a prompt becomes a {{VARIABLE}} and is declared in the
front matter with a label, so the app can show a fill-in form. Only that one category folder
is rewritten; other folders in library/ (hand-written categories) are left alone.
"""

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "source" / "content-creator-prompts.md"
CATEGORY_DIR = ROOT / "library" / "promptswallet-pack-01M6TE2NYEE1KZBTZ76ZSYPX9F" / "categories" / "Prompts for Content Creator"

# Brackets that are part of the prompt's wording, not something the user fills in.
KEEP_LITERAL = {"B-ROLL", "GRAPHIC", "CITATION NEEDED"}

# token text -> variable name, for tokens whose meaning does not depend on the prompt.
NAMES = {
    "30/60/90": "SECONDS",
    "7-10": "SLIDES",
    "8-12": "MINUTES",
    "ACHIEVEMENTS": "ACHIEVEMENTS",
    "ACTION": "CTA",
    "AGE RANGE, LOCATION, JOB, INTERESTS, ANY SURVEY DATA": "KNOWN_INFO",
    "AUDIENCE": "AUDIENCE",
    "AUDIENCE DESCRIPTION": "AUDIENCE",
    "AUDIENCE: E.G., FOUNDERS, MARKETERS": "AUDIENCE",
    "BRAND NAME": "BRAND_NAME",
    "CREATOR NAME/NICHE": "CREATOR",
    "DATES": "CART_DATES",
    'DESCRIBE THE TREND, E.G., "POV," "THINGS I WISH I KNEW," "DAY IN MY LIFE"': "TREND",
    'DETAILS OR "NONE YET"': "PROOF",
    "E.G., 1 VIDEO + 3 STORIES": "DELIVERABLES",
    "E.G., 8TH GRADE": "READING_LEVEL",
    "E.G., CLICK LINK, SUBSCRIBE": "DESIRED_ACTION",
    "E.G., GROW EMAIL LIST, LAUNCH COURSE, LAND BRAND DEALS": "CONTENT_GOALS",
    "E.G., LINKEDIN, INSTAGRAM, X, TIKTOK": "PLATFORMS",
    "E.G., WITTY, WARM, DIRECT, EXPERT-BUT-FRIENDLY": "BRAND_VOICE",
    "EMAIL SUMMARY": "EMAIL_SUMMARY",
    "GOAL": "GOAL",
    "GOAL, E.G., GROW FOLLOWERS / SELL A PRODUCT": "GOAL",
    "GOALS": "NEXT_GOALS",
    "IDEA OR PASTE CONTENT": "IDEA",
    'IDEAS OR "NONE"': "COLLAB_IDEAS",
    "INCENTIVE": "INCENTIVE",
    "INTENT": "SEARCH_INTENT",
    "KEYWORD": "KEYWORD",
    "LEAD MAGNET": "LEAD_MAGNET",
    "LINK DESCRIPTION": "LINK_DESCRIPTION",
    "LIST NAMES OR PASTE THEIR TOP CONTENT TOPICS": "COMPETITORS",
    "LIST TRENDS/NEWS": "TRENDS",
    "NICHE": "NICHE",
    "NUMBER": "NUMBER",
    "PASTE 2-3 SAMPLES": "WRITING_SAMPLES",
    "PASTE ARTICLE/TRANSCRIPT/NOTES": "ORIGINAL_CONTENT",
    "PASTE COMMENTS": "COMMENTS",
    "PASTE DATA: VIEWS, WATCH TIME, CTR, LIKES, SHARES, FOLLOWER CHANGE, TOP/BOTTOM POSTS": "METRICS",
    "PASTE DRAFT": "DRAFT",
    "PASTE MESSAGE": "MESSAGE",
    "PASTE NOTES": "NOTES",
    "PASTE OUTLINE": "OUTLINE",
    "PASTE SCRIPT": "SCRIPT",
    "PASTE SCRIPT OR SUMMARY": "VIDEO_CONTENT",
    "PASTE TRANSCRIPT": "TRANSCRIPT",
    "PASTE TRANSCRIPT WITH TIMESTAMPS IF AVAILABLE": "TRANSCRIPT",
    "PASTE YOUR STORY OR BULLET POINTS": "STORY",
    "PLATFORM": "PLATFORM",
    "PLATFORM, NICHE, FOLLOWER COUNT, AVG VIEWS, ENGAGEMENT RATE": "CHANNEL_STATS",
    "PLATFORM: TIKTOK/REELS/SHORTS": "PLATFORM",
    "PLATFORMS": "PLATFORMS",
    "PRICE": "PRICE",
    "PRIMARY KEYWORD": "KEYWORD",
    "PRODUCT": "PRODUCT",
    "PRODUCT/COURSE": "PRODUCT",
    "PRODUCT/SERVICE": "PRODUCT",
    "PRODUCT/SERVICE/OFFER": "PRODUCT",
    "REASONS": "FIT_REASONS",
    "RESULT": "RESULT",
    "RESULT/TOPIC": "RESULT",
    "SKILL/TASK": "SKILL",
    "SKILLS": "SKILLS",
    "TIME, BUDGET, TEAM": "CONSTRAINTS",
    "TITLE": "TITLE",
    "TONE": "TONE",
    "TOPIC": "TOPIC",
    "TOPIC AND MAIN TAKEAWAY": "TOPIC",
    "TOPIC/LESSON": "TOPIC",
    "WATCH NEXT VIDEO / SUBSCRIBE / JOIN LIST": "CTA",
    "WHO THEY ARE, THEIR PROBLEMS, THEIR GOALS": "AUDIENCE",
    "WINS, MISSES, METRICS, TIME SPENT, ENERGY LEVELS, REVENUE": "LAST_QUARTER",
    "WORD COUNT": "WORD_COUNT",
    "X POSTS PER WEEK": "POSTS_PER_WEEK",
    "YOUR POSITIONING": "POSITIONING",
    "YOUR STORY OR EXPERTISE": "EXPERTISE",
}

# (prompt number, token) -> name, for tokens that mean different things in different prompts.
# Prompt 0 is the Master Context Block.
CONTEXT_NAMES = {
    (31, "DETAILS"): "DEADLINE",
    (36, "DETAILS"): "BONUSES",
    (37, "DETAILS"): "WHATS_NEW",
    (45, "DETAILS"): "AUDIENCE_DEMOGRAPHICS",
    (49, "DETAILS"): "MY_STATS",
    (0, "LIST"): "AVOIDED_WORDS",
    (31, "LIST"): "KEY_BENEFITS",
    (36, "LIST"): "PAIN_POINTS",
    (46, "LIST"): "PAIN_POINTS",
    (47, "LIST"): "FEATURES",
    (18, "PASTE"): "TRANSCRIPT",
    (23, "PASTE"): "CURRENT_INTRO",
    (32, "PASTE"): "CURRENT_BIO",
    (0, "NAME"): "CREATOR_NAME",
    (37, "NAME"): "BRAND_NAME",
}

# Hint shown inside the empty input of the fill-in form.
HINTS = {
    "SECONDS": "30, 60 or 90",
    "SLIDES": "7-10",
    "MINUTES": "8-12",
    "KNOWN_INFO": "age range, location, job, interests, survey data",
    "TREND": 'e.g. "POV", "things I wish I knew", "day in my life"',
    "PROOF": 'testimonials or "none yet"',
    "DELIVERABLES": "e.g. 1 video + 3 stories",
    "READING_LEVEL": "e.g. 8th grade",
    "DESIRED_ACTION": "e.g. click the link, subscribe",
    "CONTENT_GOALS": "e.g. grow email list, launch a course",
    "PLATFORMS": "e.g. LinkedIn, Instagram, X, TikTok",
    "BRAND_VOICE": "e.g. witty, warm, direct",
    "COLLAB_IDEAS": 'ideas, or "none"',
    "CHANNEL_STATS": "platform, niche, followers, average views, engagement rate",
    "PLATFORM": "e.g. TikTok, Reels, Shorts",
    "CTA": "e.g. watch the next video, subscribe, join my list",
    "LAST_QUARTER": "wins, misses, metrics, time spent, energy, revenue",
    "CONSTRAINTS": "time, budget, team",
    "METRICS": "views, watch time, CTR, likes, shares, follower change, top and bottom posts",
    "GOAL": "e.g. grow followers, sell a product",
    "COMPETITORS": "names, or paste their top content topics",
    "TRENDS": "trends or news you have noticed",
    "TRANSCRIPT": "paste the transcript",
    "ORIGINAL_CONTENT": "paste your article, transcript or notes",
    "WRITING_SAMPLES": "paste 2-3 samples of your writing",
}

GROUP_TAGS = {
    "Ideation & Strategy": "ideation",
    "Short-Form Video": "short-form",
    "YouTube & Long-Form Video": "youtube",
    "Blogging & SEO": "blogging-seo",
    "Social Media Copy": "social",
    "Newsletters & Email": "email",
    "Repurposing & Editing": "repurposing",
    "Audience, Growth & Monetization": "growth",
}

DESCRIPTIONS = {
    0: "Paste this first in a chat so the model knows your niche, audience and voice for every request after it.",
    1: "A month of posts mapped to formats, hooks and calls to action.",
    2: "Define 4-5 content pillars that tie your topics to your audience and goal.",
    3: "Turn current trends into on-brand content ideas without forcing it.",
    4: "Find topics and questions your competitors overlook, then fill the gaps.",
    5: "A detailed audience persona with frustrations, desires and scroll-stopping topics.",
    6: "Five repeatable series concepts you can batch-produce every week.",
    7: "Fifteen scroll-stopping opening lines in different styles.",
    8: "A 60-second script as a two-column table of spoken lines and visuals.",
    9: "Turn a personal experience into a storytime script with a lesson.",
    10: "A fast five-step tutorial script for beginners.",
    11: "Ten myth-busting video ideas built on beliefs your audience actually holds.",
    12: "Adapt a trending format or audio to your niche with shot lists and captions.",
    13: "Captions, hashtags, cover text and pinned comments for a short video.",
    14: "Twenty YouTube video ideas with a clear promise and viewer emotion.",
    15: "Twelve title options and five thumbnail concepts for one video.",
    16: "A full 8-12 minute script with hook, sections, pattern interrupts and CTA.",
    17: "Turn messy notes into a structured video outline and flag the gaps.",
    18: "SEO description, chapters, tags and a pinned comment for a video.",
    19: "Spot where viewers drop off and get specific rewrites for the weak moments.",
    20: "A pillar page and 10-15 supporting articles built around one keyword.",
    21: "A complete blog outline with meta description, headings and FAQ.",
    22: "Draft a full article from an outline in your tone and reading level.",
    23: "Four different ways to open a blog post: story, fact, question, problem.",
    24: "Audit a draft for SEO and readability with a prioritized to-do list.",
    25: "A listicle with headings, examples and a closing recommendation.",
    26: "A LinkedIn post with a hook, a story, takeaways and a closing question.",
    27: "Turn an idea into a ten-post X thread with alternative hooks.",
    28: "A slide-by-slide Instagram carousel with caption and hashtags.",
    29: "Fifteen relatable, light-hearted post ideas with ready captions.",
    30: "Twenty-five quick questions that get your audience talking.",
    31: "Five honest promo posts, each with a different angle.",
    32: "Rewrite your profile bio within the platform limit, with five options.",
    33: "A five-email welcome sequence for new subscribers.",
    34: "A reusable weekly newsletter template, filled in for this week's topic.",
    35: "Twenty subject lines across styles, with preview text for the best five.",
    36: "A six-email launch sequence that stays truthful about scarcity.",
    37: "A three-email win-back sequence ending in a graceful goodbye.",
    38: "Repurpose one piece into posts, a thread, a carousel, scripts and quotes.",
    39: "Convert a raw transcript into a polished article in your voice.",
    40: "Find the eight best moments in a long video for short-form clips.",
    41: "Learn your writing voice from samples, then rewrite a draft to match.",
    42: "A tough but fair edit: cut fluff, fix weak verbs, strengthen the ends.",
    43: "Adapt one message to the norms of several platforms.",
    44: "Draft authentic replies to comments and spot follow-up content ideas.",
    45: "A short sponsor pitch email with subject line options.",
    46: "Ten digital product ideas you could build within 30 days.",
    47: "Honest sales page copy with FAQ and guarantee sections.",
    48: "Read your last 30 days of metrics and get experiments to run next.",
    49: "A non-pushy collaboration DM, a follow-up and five collab formats.",
    50: "A quarterly review with priorities, workflow and measurable targets.",
}


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s


LABELS = {"CTA": "Call to action", "SEARCH_INTENT": "Search intent", "WHATS_NEW": "What's new"}


def humanize(name: str) -> str:
    return LABELS.get(name) or name.replace("_", " ").capitalize()


def parse_source(text: str):
    """Yield (number, title, group, body) for the master block and every numbered prompt."""
    items = []

    master = re.search(r"### Master Context Block.*?```\n(.*?)```", text, re.S)
    if master:
        items.append((0, "Master Context Block", "Ideation & Strategy", master.group(1).strip()))

    group = ""
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        g = re.match(r"^## \d+\. (.+)$", line)
        if g:
            group = g.group(1).strip()
        p = re.match(r"^### Prompt (\d+): (.+)$", line)
        if p:
            number, title = int(p.group(1)), p.group(2).strip()
            j = i + 1
            while j < len(lines) and not lines[j].startswith("```"):
                j += 1
            k = j + 1
            body_lines = []
            while k < len(lines) and not lines[k].startswith("```"):
                body_lines.append(lines[k])
                k += 1
            items.append((number, title, group, "\n".join(body_lines).strip()))
            i = k
        i += 1
    return items


def convert(number: int, body: str):
    """Replace [TOKENS] with {{VARIABLES}}. Returns (new_body, ordered variable names)."""
    order = []

    def repl(m):
        token = m.group(1)
        if token in KEEP_LITERAL:
            return m.group(0)
        name = CONTEXT_NAMES.get((number, token)) or NAMES.get(token)
        if not name:
            raise SystemExit(f"Prompt {number}: no variable name for [{token}]")
        if name not in order:
            order.append(name)
        return "{{" + name + "}}"

    return re.sub(r"\[([^\[\]]+)\]", repl, body), order


def q(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def write_prompt(number, title, group, body):
    new_body, names = convert(number, body)
    slug = f"{number:02d}-{slugify(title)}"
    tag = GROUP_TAGS[group]

    out = ["---", f"id: cc-{slug}", f"title: {q(title)}", f"description: {q(DESCRIPTIONS[number])}"]
    out.append(f"tags: [content-creator, {tag}]")
    if names:
        out.append("variables:")
        for n in names:
            out.append(f"  - name: {n}")
            out.append(f"    label: {q(humanize(n))}")
            if n in HINTS:
                out.append(f"    placeholder: {q(HINTS[n])}")
    out += ["created: 2026-11-05", "updated: 2026-11-05", "---", "", new_body, ""]
    (CATEGORY_DIR / f"{slug}.md").write_text("\n".join(out), encoding="utf8")
    return len(names)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    items = parse_source(src.read_text(encoding="utf8"))
    numbers = sorted(n for n, *_ in items)
    if numbers != list(range(0, 51)):
        raise SystemExit(f"Expected prompts 0-50, found {numbers}")

    if CATEGORY_DIR.exists():
        shutil.rmtree(CATEGORY_DIR)
    CATEGORY_DIR.mkdir(parents=True)

    total_vars = 0
    for number, title, group, body in sorted(items):
        total_vars += write_prompt(number, title, group, body)

    (CATEGORY_DIR / "_category.yaml").write_text(
        "description: 51 ready-to-use prompts for ideation, scripting, writing, repurposing and growth.\n"
        "icon: pen\n"
        "order: 1\n",
        encoding="utf8",
    )
    print(f"Wrote {len(items)} prompts ({total_vars} variable declarations) to {CATEGORY_DIR}")


if __name__ == "__main__":
    main()
