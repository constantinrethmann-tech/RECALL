# RECALL

Personal spaced-repetition flashcards (FSRS, like Anki), with pictures, synced between iPhone and laptop.
Installs as an app: Safari → Add to Home Screen on iPhone, Chrome/Edge → Install on Windows.
See [SPEC.md](SPEC.md) for the full wish list.

- **App:** Next.js (static export) + TypeScript + Tailwind, hosted on GitHub Pages
- **Data:** Supabase (database, sign-in by email code, private picture storage). Row-level security: only you can see your data.
- **Scheduling:** [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS-6 default parameters, learning steps 1m/10m, relearning 10m, fuzz on)

## What's in it

- **Study:** one unit, a whole subject, everything, or a focus: *Exam*, each *Case study*, any other tag, and *Trouble cards*.
  **Learn** mode = normal FSRS reviews; **Cram** mode = every card of the selection in random order, schedule untouched.
- **Review:** Again/Hard/Good/Easy with the next interval on each button, picture zoom, undo, edit in place.
  Keys: Space show answer (then Good), 1–4 rate, Z undo, E edit.
- **Scheduling details** ([src/lib/effort.ts](src/lib/effort.ts), [src/lib/queue.ts](src/lib/queue.ts)):
  reviews are ordered by lowest recall probability first; new cards are spread between reviews;
  daily limits: new cards per subject, reviews per day; the day starts at 4:00.
  *Recall speed:* a Good/Easy answer that took far longer than your usual recall time (median of your past answers,
  adjusted for question length and pictures) is scored part of the way towards Hard/Good — sooner return, higher difficulty.
  Pauses over 2 min or while the app was in the background are ignored.
- **Overview:** new / learning / due per unit, progress bars, focus chips, streak, live updates across devices.
- **Cards:** browse, search, add, edit, delete; pictures from photos, camera or paste (shrunk to 1600px).
- **Import:** `.zip` with `cards.json` (format `recall-v1`, see SPEC.md) and `images/`. Preview first; re-importing a card
  with the same `id` updates its text and pictures but keeps its progress.
- **Brain dump:** timed free recall per unit or section, question-only hints, a free key-term check
  ([src/lib/braindump.ts](src/lib/braindump.ts)), missed cards into today's review, history per unit.
- **Backup:** Settings → Create backup: one zip with all data, progress and pictures.

## Run it on the laptop

Needs Node.js 24.

```bash
npm install
npm run dev
```

Open http://localhost:3000/recall/. `/recall/dev/review/` shows the review screen with sample cards and no database
(`?mode=cram` for cram mode).

Other commands: `npm test` (logic tests), `npm run lint`, `npm run build` (static site in `out/`),
`npm run icons` (redraw app icons), `npm run sample` (rebuild `samples/recall-sample.zip`).

## Settings

`.env` holds the public settings (Supabase URL + publishable key, base path `/recall`). They are safe to commit:
they end up in the public website anyway, and your data is protected by row-level security, not by them.
Never commit the Supabase secret/service_role key or the database password; real secrets would go in
`.env.local`, which git ignores.

## Deploy

Every push to `main` runs the tests, builds and publishes the site through GitHub Actions
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) to https://constantinrethmann-tech.github.io/recall/.
One-time: repo **Settings → Pages → Source: GitHub Actions**.

## Database

Run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) in Supabase → SQL Editor (safe to re-run after updates).
Sign-in email templates: [supabase/email-templates.md](supabase/email-templates.md).
Supabase → Authentication → URL Configuration: Site URL `https://constantinrethmann-tech.github.io/recall`,
Redirect URLs `https://constantinrethmann-tech.github.io/recall/**` and `http://localhost:3000/**`.

## Later (v2)

Mind maps, AI feedback for brain dumps, image occlusion (`cards.kind` / `cards.extra` are reserved for it),
Anki .apkg import, statistics charts, offline reviewing, tuning FSRS to your own review history (all ratings are kept in `review_logs`).
