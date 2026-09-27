# RECALL — Spec

I want you to build my own flashcard web app — basically Anki, but tailored to me. I'm a business student, not a developer: you write all the code, I test and give feedback. Explain every setup step (accounts, keys, clicks) in plain language, one step at a time. First save this whole message as SPEC.md in the project, then start with Phase 1.

WORKING NAME: RECALL (I may rename it)

## GOAL
- Anki-style spaced repetition with the same modern algorithm Anki uses (FSRS), and Again / Hard / Good / Easy buttons.
- Pictures on the question AND/OR the answer side of any card.
- Cards organised Subject → Unit (→ Section), e.g. "Business Law I → Unit 03 → A. S.A. vs S.L.".
- I study one unit, a whole subject mixed, or everything mixed. Or only cards with a tag (e.g. "exam", "case-study-1").
- Extra learning mode: "brain dump" (explained below).
- New cards mostly come from Claude: I upload lecture PDFs in another Claude chat, and it gives me an import file (format below). I tap Import and the cards are in, pictures included.

## PLATFORM
- Web app, installable on iPhone as a PWA (Safari → Add to Home Screen) and used on my laptop. Everything syncs between both.
- Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth with email magic link, Storage for images), ts-fsrs for scheduling, JSZip for import, hosted on GitHub Pages (like KAIROS; decided 2026-09-26 instead of Vercel). Free tiers only.
- All data lives in Supabase (iOS can wipe local web-app storage). Use row-level security so only I can see my data.
- The app must work equally well on my laptop (Windows) and my iPhone, with the same account and the same data, synced in real time through Supabase.
- On the laptop, it must be installable as a desktop app via Chrome/Edge "Install app" (PWA): its own window, taskbar icon and app icon, no browser bar. Same as how I use KAIROS on my laptop.
- The layout adapts: on the laptop, use the wider screen (e.g. the overview sidebar next to the review area, and a bigger text area in brain dump mode). On the phone, keep it one column.
- Keyboard shortcuts on the laptop: Space = show answer, 1/2/3/4 = Again/Hard/Good/Easy, E = edit card, Z = undo.
- Help me install it on both devices at the end of Phase 1.

## DESIGN
- Same feel as my other app KAIROS: black background, minimalist, futuristic, one accent colour, clean typography.
- Mobile-first: big tap targets, one-handed review, the four rating buttons at the bottom of the screen.
- Laptop keyboard shortcuts like Anki: Space = show answer, 1/2/3/4 = Again/Hard/Good/Easy.

## CORE FEATURES (v1)
1. Review screen: show the front (text + optional image) → tap to reveal the back (text + optional image) → Again/Hard/Good/Easy. Each button shows its next interval (e.g. "10m", "1d", "4d", "9d"), like Anki. Tap an image to zoom. Undo the last rating.
2. Scheduling: ts-fsrs with its defaults, including short-term learning steps. Desired retention 0.90, adjustable in settings. Daily limit for new cards per subject (default 20) and a max reviews per day.
3. Study modes: (a) single unit, (b) whole subject mixed, (c) all subjects mixed, (d) filter by tag, (e) cram mode = go through a selection in random order WITHOUT changing the schedule (for the night before an exam).
4. Overview/dashboard: every subject and unit with counts (new / learning / due today) and a progress bar, total due today, and a streak.
5. Card editor: add/edit/delete cards in the app. Markdown for bold and lists. Add images to front or back from iPhone photos, the camera, or paste on laptop. Compress images before upload (max ~1600px). Edit subject/unit/section/tags.
6. Import (the main way cards get in): upload a .zip containing cards.json + an images/ folder. Show a preview (how many cards per unit, new vs updated) before confirming. If a card's "id" already exists, update its text/images but KEEP its review progress.
7. Export/backup: download everything (cards + images + progress) as one zip.

## IMPORT FORMAT (Claude will generate exactly this)
cards.json:
```json
{
  "format": "recall-v1",
  "subject": "Business Law I",
  "units": [ { "name": "Unit 03 – Capital Companies: Incorporation", "order": 3 } ],
  "cards": [
    {
      "id": "bl1-u03-min-capital-sl",
      "unit": "Unit 03 – Capital Companies: Incorporation",
      "section": "A. S.A. vs S.L.",
      "front": "Minimum share capital of an **S.L.**?",
      "back": "**€3,000** (course). Law 18/2022 allows €1 with safeguards.",
      "front_image": null,
      "back_image": "images/sa-vs-sl-table.png",
      "tags": ["exam", "case-study-1"],
      "source": "Unit 3 slides"
    }
  ]
}
```
- "id" is stable and unique; it's used to update cards on re-import.
- front/back are markdown; images are optional paths inside the zip.

## BRAIN DUMP MODE (v1)
- Pick a unit or section → set a timer (default 7 min) → write everything I know about it in a big text area.
- Hints are hidden at first. After a delay I set (default 3 min) a "Show hints" button appears, which shows the QUESTIONS of cards I haven't covered yet, not the answers.
- When I finish: a free, non-AI check compares my text with the unit's cards (key terms from each answer: bold words, numbers, article references like "Art. 58", matched case- and accent-insensitive with simple fuzzy matching). Show "covered" vs "missed" cards and a % score.
- A button "Add missed cards to today's review". Save every attempt so I can see progress over time.

## LATER (v2 — don't build now, but keep the structure ready)
- Mind map mode, real AI feedback for brain dumps (with my own Anthropic API key), image occlusion (hide parts of a picture), import of Anki .apkg files, statistics charts, offline reviewing.

## PHASES — stop after each one, tell me exactly how to test it, then wait for my OK
- Phase 1: Project setup, Supabase + GitHub Pages setup (guide me click by click), login, data model, import zip, review screen with FSRS and images. Deploy it and help me install it on my iPhone and my laptop.
- Phase 2: Dashboard, all study modes incl. tag filter and cram, settings, card editor with image upload, export/backup.
- Phase 3: Brain dump mode.

## RULES
- Keep secrets in .env.local, never in git. Write a short README with how to run and deploy.
- Small steps. Explain what you changed in 2–3 plain sentences. Ask me before big decisions.

---
_Changelog:_
- _2026-09-26 — PLATFORM section updated (laptop parity, desktop install via Chrome/Edge, adaptive wide layout, E/Z shortcuts, install on both devices at end of Phase 1)._
- _2026-09-26 — Hosting: GitHub Pages instead of Vercel (same workflow as KAIROS; the code repo is public, all data stays private in Supabase)._
- _2026-09-27 — Sign-in: email + password instead of magic link. Supabase now only allows custom email text with your own email service, and a magic link can't sign in the installed iPhone app (it opens Safari). The account is created once in the Supabase dashboard; sign-ups are switched off._
- _2026-09-27 — Scheduling: longest gap 30 days, 30 new cards per day in total (max 20 per subject), automatic memory check that shortens gaps if you forget faster than FSRS predicts._
